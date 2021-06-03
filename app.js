"use strict";

require("dotenv").config();

let http = require("http");
let express = require("express");
let app = require("@root/async-router").Router();

if ("DEVELOPMENT" === process.env.ENV) {
  // set special options
}

app.get("/hello", function (req, res) {
  return { message: "Hello, World!" };
});

// TODO error handler for /api
app.use("/", function (err, req, res, next) {
  if (err.code) {
    res.statusCode = err.status || 500;
    res.json({ status: err.status, code: err.code, message: err.message });
    return;
  }

  console.error("Unexpected Error:");
  console.error(err);
  res.statusCode = 500;
  res.end("Internal Server Error");
});

let server = express().use("/", app);
if (require.main === module) {
  let port = process.env.PORT || 3042;
  http.createServer(server).listen(port, function () {
    /* jshint validthis:true */
    console.info("Listening on", this.address());
  });
}

module.exports = app;
