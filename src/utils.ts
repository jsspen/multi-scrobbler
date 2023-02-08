import fs, {promises, constants} from "fs";
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import winston from "winston";
import jsonStringify from 'safe-stable-stringify';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'spot... Remove this comment to see the full error message
import { TimeoutError, WebapiError } from "spotify-web-api-node/src/response-error.js";
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supe... Remove this comment to see the full error message
import { Response } from 'superagent';

const {format} = winston;
const {combine, printf, timestamp, label, splat, errors} = format;

dayjs.extend(utc);

export async function readJson(this: any, path: any, {logErrors = true, throwOnNotFound = true} = {}) {
    try {
        await promises.access(path, constants.R_OK);
        const data = await promises.readFile(path);
        // @ts-expect-error TS(2345): Argument of type 'Buffer' is not assignable to par... Remove this comment to see the full error message
        return JSON.parse(data);
    } catch (e) {
        // @ts-expect-error TS(2339): Property 'code' does not exist on type 'unknown'.
        const {code} = e;
        if (code === 'ENOENT') {
            if (throwOnNotFound) {
                if (logErrors) {
                    this.logger.warn('No file found at given path', {filePath: path});
                }
                throw e;
            } else {
                return;
            }
        } else if (logErrors) {
            this.logger.warn(`Encountered error while parsing file`, {filePath: path});
            this.logger.error(e);
        }
        throw e;
    }
}

export async function readText(path: any) {
    await promises.access(path, constants.R_OK);
    const data = await promises.readFile(path);
    return data.toString();

    // return new Promise((resolve, reject) => {
    //     fs.readFile(path, 'utf8', function (err, data) {
    //         if (err) {
    //             reject(err);
    //         }
    //         resolve(JSON.parse(data));
    //     });
    // });
}

export async function writeFile(path: any, text: any) {
    // await promises.access(path, constants.W_OK | constants.O_CREAT);
    await promises.writeFile(path, text, 'utf8');

    // return new Promise((resolve, reject) => {
    //     fs.readFile(path, 'utf8', function (err, data) {
    //         if (err) {
    //             reject(err);
    //         }
    //         resolve(JSON.parse(data));
    //     });
    // });
}


export function sleep(ms: any) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const longestString = (strings: any) => strings.reduce((acc: any, curr: any) => curr.length > acc ? curr.length : acc, 0);
export const truncateStringArrToLength = (length: any, truncStr = '...') => {
    const truncater = truncateStringToLength(length, truncStr);
    return (strings: any) => strings.map(truncater);
}
export const truncateStringToLength = (length: any, truncStr = '...') => (str: any) => str.length > length ? `${str.slice(0, length)}${truncStr}` : str;

const defaultTransformer = (input: any) => input;

export const buildTrackString = (playObj: any, options = {}) => {
    const {
        // @ts-expect-error TS(2339): Property 'include' does not exist on type '{}'.
        include = ['time', 'artist', 'track'],
        // @ts-expect-error TS(2339): Property 'transformers' does not exist on type '{}... Remove this comment to see the full error message
        transformers: {
            artists: artistsFunc = (a: any) => a.join(' / '),
            track: trackFunc = defaultTransformer,
            time: timeFunc = (t: any) => t.local().format(),
            timeFromNow = (t: any) => t.local().fromNow(),
        } = {}
    } = options;
    const {
        data: {
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            artists,
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            album,
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            track,
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            playDate
        } = {},
        meta: {
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            sourceId
        } = {},
    } = playObj;

    const strParts = [];
    if(include.includes('sourceId') && sourceId !== undefined) {
        strParts.push(`(${sourceId})`);
    }
    if(include.includes('artist')) {
        strParts.push(`${artistsFunc(artists)}`)
    }
    if(include.includes('track')) {
        if(strParts.length > 0) {
            strParts.push(`- ${trackFunc(track)}`);
        } else {
            strParts.push(`${trackFunc(track)}`);
        }
    }
    if (include.includes('time')) {
        strParts.push(`@ ${timeFunc(playDate)}`);
    }
    if (include.includes('timeFromNow')) {
        strParts.push(`(${timeFromNow(playDate)})`)
    }
    return strParts.join(' ');
}

// sorts playObj formatted objects by playDate in ascending (oldest first) order
export const sortByPlayDate = (a: any, b: any) => a.data.playDate.isAfter(b.data.playDate) ? 1 : -1;

const s = splat();
const SPLAT = Symbol.for('splat')
const errorsFormat = errors({stack: true});
const CWD = process.cwd();

let longestLabel = 3;
export const defaultFormat = printf(({level, message, label = 'App', timestamp, [SPLAT]: splatObj, stack, ...rest}) => {
    let stringifyValue = splatObj !== undefined ? jsonStringify(splatObj) : '';
    if (label.length > longestLabel) {
        longestLabel = label.length;
    }
    let msg = message;
    let stackMsg = '';
    if (stack !== undefined) {
        const stackArr = stack.split('\n');
        msg = stackArr[0];
        const cleanedStack = stackArr
            .slice(1) // don't need actual error message since we are showing it as msg
            .map((x: any) => x.replace(CWD, 'CWD')) // replace file location up to cwd for user privacy
            .join('\n'); // rejoin with newline to preserve formatting
        stackMsg = `\n${cleanedStack}`;
    }

    return `${timestamp} ${level.padEnd(7)}: [${label.padEnd(longestLabel)}] ${msg}${stringifyValue !== '' ? ` ${stringifyValue}` : ''}${stackMsg}`;
});

export const labelledFormat = (labelName = 'App') => {
    const l = label({label: labelName, message: false});
    return combine(
        timestamp(
            {
                format: () => dayjs().local().format(),
            }
        ),
        l,
        s,
        errorsFormat,
        defaultFormat,
    );
}

export const createLabelledLogger = (name = 'default', label = 'App') => {
    if (winston.loggers.has(name)) {
        return winston.loggers.get(name);
    }
    const def = winston.loggers.get('default');
    winston.loggers.add(name, {
        transports: def.transports,
        level: def.level,
        format: labelledFormat(label)
    });
    return winston.loggers.get(name);
}

export const setIntersection = (setA: any, setB: any) => {
    let _intersection = new Set()
    for (let elem of setB) {
        if (setA.has(elem)) {
            _intersection.add(elem)
        }
    }
    return _intersection
}

export const isValidConfigStructure = (obj: any, required = {}) => {
    // @ts-expect-error TS(2339): Property 'name' does not exist on type '{}'.
    const {name = false, type = false, data = true} = required;
    const errs = [];
    if (obj.type === undefined && type) {
        errs.push("'type' must be defined");
    }
    if (obj.name === undefined && name) {
        errs.push("'name' must be defined")
    }
    if (obj.data === undefined && data) {
        errs.push("'data' must be defined");
    }
    if (errs.length > 0) {
        return errs;
    }
    return true;
}

export const returnDuplicateStrings = (arr: any) => {
    const alreadySeen: any = [];
    const dupes: any = [];

    arr.forEach((str: any) => alreadySeen[str] ? dupes.push(str) : alreadySeen[str] = true);
    return dupes;
}

export const capitalize = (str: any) => {
    return str.charAt(0).toUpperCase() + str.slice(1)
}
/**
 * Check if two play objects are the same by comparing non time-related data using most-to-least specific/confidence
 *
 * Checks sources and source ID's (unique identifiers) first then
 * Checks track, album, and artists in that order
 * */
export const playObjDataMatch = (a: any, b: any) => {
    const {
        data: {
            artists: aArtists = [],
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            album: aAlbum,
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            track: aTrack,
        } = {},
        meta: {
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            source: aSource,
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            sourceId: aSourceId,
        } = {},
    } = a;

    const {
        data: {
            artists: bArtists = [],
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            album: bAlbum,
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            track: bTrack,
        } = {},
        meta: {
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            source: bSource,
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            sourceId: bSourceId,
        } = {},
    } = b;

    // if sources are the same and both plays have source ids then we can just compare by id
    if(aSource === bSource && aSourceId !== undefined && bSourceId !== undefined) {
        if(aSourceId !== bSourceId) {
            return false;
        }
    }

    if (aTrack !== bTrack) {
        return false;
    }
    if (aAlbum !== bAlbum) {
        return false;
    }
    if (aArtists.length !== bArtists.length) {
        return false;
    }
    // check if every artist from either playObj matches (one way or another) with the artists from the other play obj
    if (!aArtists.every((x: any) => bArtists.includes(x)) && bArtists.every((x: any) => aArtists.includes(x))) {
        return false
    }

    return true;
}

export const parseRetryAfterSecsFromObj = (err: any) => {

    let raVal;

    if (err instanceof TimeoutError) {
        return undefined;
    }
    if (err instanceof WebapiError || err instanceof Response) {
        const {headers = {}} = err;
        raVal = headers['retry-after']
    }
    // if (err instanceof Response) {
    //     const {headers = {}} = err;
    //     raVal = headers['retry-after']
    // }
    const {
        response: {
            // @ts-expect-error TS(2525): Initializer provides no value for this binding ele... Remove this comment to see the full error message
            headers, // returned in superagent error
        } = {},
        retryAfter: ra // possible custom property we have set
    } = err;

    if (ra !== undefined) {
        raVal = ra;
    } else if (headers !== null && typeof headers === 'object') {
        raVal = headers['retry-after'];
    }

    if (raVal === undefined || raVal === null) {
        return raVal;
    }

    // first try to parse as float
    let retryAfter = Number.parseFloat(raVal);
    if (!isNaN(retryAfter)) {
        return retryAfter; // got a number!
    }
    // try to parse as date
    // @ts-expect-error TS(2322): Type 'Dayjs' is not assignable to type 'number'.
    retryAfter = dayjs(retryAfter);
    if (!dayjs.isDayjs(retryAfter)) {
        return undefined; // could not parse string if not in ISO 8601 format
    }
    // otherwise we got a date! now get the difference the specified retry-after date and now in seconds
    const diff = retryAfter.diff(dayjs(), 'second');

    if (diff <= 0) {
        // if diff is in the past returned undefined as its irrelevant now
        return undefined;
    }

    return diff;
}

export const spreadDelay = (retries: any, multiplier: any) => {
    if(retries === 0) {
        return [];
    }
    let r;
    let s = [];
    for(r = 0; r < retries; r++) {
        s.push(((r+1) * multiplier) * 1000);
    }
    return s;
}

export const removeUndefinedKeys = (obj: any) => {
    let newObj = {};
    Object.keys(obj).forEach((key) => {
        if(Array.isArray(obj[key])) {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            newObj[key] = obj[key];
        } else if (obj[key] === Object(obj[key])) {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            newObj[key] = removeUndefinedKeys(obj[key]);
        } else if (obj[key] !== undefined) {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            newObj[key] = obj[key];
        }
    });
    if(Object.keys(newObj).length === 0) {
        return undefined;
    }
    Object.keys(newObj).forEach(key => {
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        if(newObj[key] === undefined || (null !== newObj[key] && typeof newObj[key] === 'object' && Object.keys(newObj[key]).length === 0)) {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            delete newObj[key]
        }
    });
    return newObj;
}

export const parseDurationFromTimestamp = (timestamp: any) => {
    if (timestamp === null || timestamp === undefined) {
        return undefined;
    }
    if (!(typeof timestamp === 'string')) {
        throw new Error('Timestamp must be a string');
    }
    if (timestamp.trim() === '') {
        return undefined;
    }
    const parsedRuntime = timestamp.split(':');
    let hours = '0',
        minutes = '0',
        seconds = '0',
        milli = '0';

    switch (parsedRuntime.length) {
        case 3:
            hours = parsedRuntime[0];
            minutes = parsedRuntime[1];
            seconds = parsedRuntime[2];
            break;
        case 2:
            minutes = parsedRuntime[0];
            seconds = parsedRuntime[1];
            break;
        case 1:
            seconds = parsedRuntime[0];
    }
    const splitSec = seconds.split('.');
    if (splitSec.length > 1) {
        seconds = splitSec[0];
        milli = splitSec[1];
    }
    return dayjs.duration({
        hours: Number.parseInt(hours),
        minutes: Number.parseInt(minutes),
        seconds: Number.parseInt(seconds),
        milliseconds: Number.parseInt(milli)
    });
}
