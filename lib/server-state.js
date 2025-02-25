/*
 * @file server-state.js
 * @license MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

let ServerState = {};

/** @type {AppInfo} */
ServerState._appInfo = {
  hostname: "example.tld",
  name: "example-app",
  version: "v0.0.0",
  publicEnvs: ["NODE_ENV", "PORT"],
  secretEnvs: ["DOESNTEXIST"],
};

ServerState.STARTED_AT = Date.now();
ServerState._MASK = "*";

/** @typedef {Number} UInt8 */
/** @typedef {String} DomainString */
/** @typedef {String} UpperString */
/** @typedef {String} VersionString */

/**
 * @typedef AppInfo
 * @prop {DomainString} hostname
 * @prop {String} name
 * @prop {VersionString} version
 * @prop {Array<UpperString>} publicEnvs
 * @prop {Array<UpperString>} secretEnvs
 */

/**
 * @param {AppInfo} appInfo
 */
ServerState.init = async function (appInfo) {
  Object.assign(ServerState._appInfo, appInfo);
};

/**
 * @param {String} str
 * @param {UInt8} lastN
 */
ServerState._scrub = function (str, lastN) {
  if (lastN > 4) {
    throw new Error(
      "[SECURITY] Refusing to show more than the last 4 characters of a secret.",
    );
  }

  // return early if we should mask all characters
  let visible = lastN || 0;
  let shouldMaskAll = visible === 0 || str.length < 8;
  if (shouldMaskAll) {
    let masked = ServerState._MASK.repeat(str.length);
    return masked;
  }

  // show no more than a quarter of the characters (i.e. last 2 of 8)
  let maxVisibleF = str.length / 4;
  let maxVisible = Math.floor(maxVisibleF);
  visible = Math.min(maxVisible, visible);

  // 'my-secret-string' => '**************ng'
  let maskLen = str.length + -visible;
  let mask = ServerState._MASK.repeat(maskLen);
  let lastNChars = str.slice(str.length - visible);

  let masked = `${mask}${lastNChars}`;
  return masked;
};

/** @type {import('express').Handler} */
ServerState.getEnvs = async function (req, res) {
  /** @type {Object.<UpperString, String>} */
  let envsMap = {};

  let envNames = ServerState._appInfo.publicEnvs.concat(
    ServerState._appInfo.secretEnvs,
  );
  void envNames.sort();

  for (let envName of envNames) {
    let val = process.env[envName] || "";
    let isPublic = ServerState._appInfo.publicEnvs.includes(envName);
    if (isPublic) {
      envsMap[envName] = val;
      continue;
    }

    // XXX SECURITY -- DO NOT REMOVE `scrub()`
    let lastN = 2;
    envsMap[envName] = ServerState._scrub(val, lastN);
  }

  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(envsMap, null, 2));
};

/** @type {import('express').Handler} */
ServerState.getPong = async function (req, res) {
  let now = Date.now();
  let uptimeMs = now - ServerState.STARTED_AT;

  let uptimeSecs = uptimeMs / 1000;
  {
    let uptimeFixed = uptimeSecs.toFixed(3);
    uptimeSecs = parseFloat(uptimeFixed);
  }

  let parts = ServerState._durationToParts(uptimeMs);

  let result = {
    hostname: ServerState._appInfo.hostname,
    uptime_debug: `${parts.hours}h ${parts.minutes}m ${parts.seconds}s`,
    uptime_seconds: uptimeSecs,
    version: `${ServerState._appInfo.name}/${ServerState._appInfo.version}`,
    versions: {
      api: ServerState._appInfo.version,
      node: process.versions.node,
      icu: process.versions.icu,
      tz: process.versions.tz,
    },
  };

  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(result, null, 2));
};

/**
 * Into hour, minute, and second parts
 * @param {Number} duration - milliseconds
 */
ServerState._durationToParts = function (duration) {
  let uptimeSecs = duration / 1000;
  uptimeSecs = Math.floor(uptimeSecs);

  let days = 0;
  days = uptimeSecs / 86400;
  days = Math.floor(days);
  uptimeSecs -= days * 86400;

  let hours = 0;
  hours = uptimeSecs / 3600;
  hours = Math.floor(hours);
  uptimeSecs -= hours * 3600;

  let minute = "00";
  let minutes = uptimeSecs / 60;
  minutes = Math.floor(minutes);
  uptimeSecs -= minutes * 60;
  minute = minutes.toString().padStart(2, "0");

  let second = "00";
  let seconds = uptimeSecs;
  seconds = Math.floor(seconds);
  second = seconds.toString().padStart(2, "0");

  let description = ``;
  if (days > 0) {
    description = `${days}d `;
  }
  if (hours > 0) {
    description = `${description}${hours}h `;
  }
  if (minutes > 0) {
    description = `${description}${minute}m `;
  }
  description = `${description}${second}s`;

  return {
    days: days.toString(),
    hours: hours.toString(),
    minutes: minute,
    seconds: second,
    description: description,
  };
};

/** @type {import('express').Handler} */
ServerState.getUptime = async function (req, res) {
  let now = Date.now();
  let uptimeMs = now - ServerState.STARTED_AT;

  let uptimeSecs = uptimeMs / 1000;
  {
    let uptimeFixed = uptimeSecs.toFixed(3);
    uptimeSecs = parseFloat(uptimeFixed);
  }

  let parts = ServerState._durationToParts(uptimeMs);

  let result = {
    uptime_debug: parts.description,
    uptime_seconds: uptimeSecs,
  };

  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(result, null, 2));
};

/** @type {import('express').Handler} */
ServerState.getVersion = async function getVersions(req, res) {
  let result = {
    version: `${ServerState._appInfo.name}/${ServerState._appInfo.version}`,
  };

  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(result, null, 2));
};

/** @type {import('express').Handler} */
ServerState.getVersions = async function getVersions(req, res) {
  let result = {
    api: ServerState._appInfo.version,
    node: process.versions.node,
    icu: process.versions.icu,
    tz: process.versions.tz,
  };

  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(result, null, 2));
};

export default ServerState;
export let init = ServerState.init;
export let STARTED_AT = ServerState.STARTED_AT;
export let getEnvs = ServerState.getEnvs;
export let getPong = ServerState.getPong;
export let getUptime = ServerState.getUptime;
export let getVersion = ServerState.getVersion;
export let getVersions = ServerState.getVersions;
