import DotEnv from "dotenv";

import Http from "node:http";
import Path from "node:path";
import Fs from "node:fs/promises";

import express from "express";
import Express from "express";
import ServerState from "./lib/server-state.js";
import UUIDv7 from "@root/uuidv7";
import XTZ from "xtz";

DotEnv.config({ path: ".env" });
DotEnv.config({ path: ".env.secret" });

let modulePath = import.meta.url.slice("file://".length);
let moduleDir = Path.dirname(modulePath);

const APP_TIMEZONE = process.env.APP_TIMEZONE || "Etc/UTC";
const BIND_ADDRESS = process.env.BIND_ADDRESS || "localhost";
const PORT = process.env.PORT || "3000";

async function main() {
  let pkgPath = Path.join(moduleDir, `package.json`);
  let pkgJson = await Fs.readFile(pkgPath, `utf8`);
  let pkg;
  try {
    pkg = JSON.parse(pkgJson);
  } catch (_e) {
    /** @type {Error} */ //@ts-expect-error
    let e = _e;
    console.error(`falied to parse package.json:`);
    console.error(e.message);
    process.exit(1);
  }

  let hostUrl = new URL(process.env.APP_BASE_URL || "");
  await ServerState.init({
    hostname: hostUrl.hostname,
    name: pkg.name,
    version: pkg.version,
    publicEnvs: [
      "NODE_ENV",
      "BIND_ADDRESS",
      "PORT",
      "APP_BASE_URL",
      "APP_TIMEZONE",
      "GOOGLE_CLIENT_ID",
    ],
    secretEnvs: [
      "GOOGLE_CLIENT_SECRET",
      "POSTMARK_SERVER_TOKEN",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_MESSAGING_SERVICE_SID",
    ],
  });

  let server = express();
  let debugRoutes = Express.Router();
  server.use("/api", debugRoutes);
  server.use("/api/public", debugRoutes);
  {
    debugRoutes.get("/ping", ServerState.getPong);
    debugRoutes.get("/uptime", ServerState.getUptime);
    debugRoutes.get("/version", ServerState.getVersion);
    debugRoutes.get("/versions", ServerState.getVersions);
    debugRoutes.get("/envs", ServerState.getEnvs);
  }

  server.use("/", nonApiErrorHandler);

  let httpServer = Http.createServer(server);
  let port = parseInt(PORT);
  httpServer.on("error", function (err) {
    throw err; // to be caught by main handler
  });
  let defaultBacklog = 511;
  httpServer.listen(port, BIND_ADDRESS, defaultBacklog, function () {
    /** @type {import('node:net').AddressInfo} */ //@ts-expect-error
    let addr = httpServer.address();
    console.info(
      `Listening on ${addr.family} http://${addr.address}:${addr.port}`,
    );
  });

  return httpServer;
}

/**
 * @param {import('node:http').Server} httpServer
 */
function createSigintHandler(httpServer) {
  return function () {
    console.error(`trying to shut down gracefully within 10 seconds...`);
    httpServer.close();

    let timeout = setTimeout(function () {
      console.error(`failed to shutdown gracefully, exiting now`);
      process.exit(1);
    }, 10000);
    timeout.unref();
  };
}

function sigtermHandler() {
  console.error(`obeying direct order for non-gracefull shutdown (kill -9)...`);
  process.exit(1);
}

/** @type {import('express').ErrorRequestHandler} */
async function nonApiErrorHandler(_err, req, res, next) {
  let serverDate = new Date();
  let serverStr = serverDate.toISOString();
  let ts = XTZ.toOffsetISOString(serverStr, APP_TIMEZONE);
  ts = ts.replace("T", " ");

  let errId = _err._id || UUIDv7.uuidv7();
  let err = Object.assign({
    _id: errId,
    _method: req.method,
    _url: req.url,
    _ts: ts,
  });
  console.error(err);

  res.setHeader("Content-Type", "text/plain");
  // TODO send error to dev SMS + email
  res.end(
    `Internal Server Error\n\nPlease Contact Support\nTimestamp: ${ts}\nError ID: ${errId}`,
  );
}

/**
 * Catches dangling (non-awaited) promises, such as `void sleep(ms).then(fn)`
 * @param {Error & { code: string }} reason
 * @param {Promise<any>} promise
 */
function unhandledRejectionHandler(reason, promise) {
  console.error("Unhandled Rejection:");
  console.error(reason);
}

/**
 * Catches asynchronous errors, such as with
 * `setTimeout(fn, ms)` or `process.nextTick(fn)`
 * @param {Error & { code: string }} err
 */
function uncaughtExceptionHandler(err) {
  console.error("Uncaught Exception:");
  console.error(err);
}

/** @param {Object.<String|Number, any>} err */
function mainErrorHandler(err) {
  console.error("Error during bootstrap process:");
  console.error(err);

  if (err.code === "EADDRINUSE") {
    console.error(
      "another process may be listening on the same address and/or port",
    );
  }

  process.exit(1);
}

main()
  .then(function (httpServer) {
    let sigintHandler = createSigintHandler(httpServer);
    process.on("SIGINT", sigintHandler);
    process.on("SIGTERM", sigtermHandler);
  })
  .catch(mainErrorHandler);
// replaces the old 'unhandledPromiseRejectionWarning'
process.on("unhandledRejection", unhandledRejectionHandler);
process.on("uncaughtException", uncaughtExceptionHandler);
