#!/usr/bin/env node
// Chrome Web Store OAuth: loopback flow, fixed port so the auth URL is stable.
// Mirrors chrome-webstore-upload-keys, minus the TTY-only prompts.
//
// Credentials are read from ./.env by default so that no secret has to appear on
// the command line (which is what put the last client secret into shell history).
// The refresh token is written to CWS_OUT and never printed unless you ask for it.

import {createServer} from 'node:http';
import {writeFileSync, readFileSync, existsSync} from 'node:fs';

function loadDotEnv(path) {
	if (!existsSync(path)) return {};
	const out = {};
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i.exec(line);
		if (!match) continue;
		out[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
	}
	return out;
}

const env = loadDotEnv(process.env.CWS_ENV_FILE || '.env');

const CLIENT_ID = process.env.CWS_CLIENT_ID || env.CLIENT_ID;
const CLIENT_SECRET = process.env.CWS_CLIENT_SECRET || env.CLIENT_SECRET;
const PORT = Number(process.env.CWS_PORT || 8818);
const OUT = process.env.CWS_OUT || 'refresh_token.txt';
const PRINT = process.env.CWS_PRINT === '1';

if (!CLIENT_ID || !CLIENT_SECRET) {
	console.error('Missing client credentials.');
	console.error('Put CLIENT_ID / CLIENT_SECRET in .env, or set CWS_CLIENT_ID / CWS_CLIENT_SECRET.');
	process.exit(1);
}

const serverUrl = `http://127.0.0.1:${PORT}`;

const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/chromewebstore');
authUrl.searchParams.set('redirect_uri', serverUrl);
// Force the consent screen: Google only returns a refresh_token on the first
// approval unless re-consent is explicitly requested.
authUrl.searchParams.set('prompt', 'consent');

async function exchange(code) {
	const response = await fetch('https://accounts.google.com/o/oauth2/token', {
		method: 'POST',
		headers: {'Content-Type': 'application/x-www-form-urlencoded'},
		body: new URLSearchParams([
			['client_id', CLIENT_ID],
			['client_secret', CLIENT_SECRET],
			['code', code],
			['grant_type', 'authorization_code'],
			['redirect_uri', serverUrl],
		]),
	});

	const text = await response.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		throw new Error(`Non-JSON token response (HTTP ${response.status}): ${text}`);
	}

	if (!response.ok || json.error) {
		throw new Error(`Token exchange failed (HTTP ${response.status}): ${JSON.stringify(json)}`);
	}

	return json;
}

const server = createServer(async (request, response) => {
	const {searchParams} = new URL(request.url, serverUrl);

	if (searchParams.has('error')) {
		const error = searchParams.get('error');
		response.writeHead(200, {'Content-Type': 'text/html'});
		response.end(`<h1>Authorization denied</h1><p>${error}</p>`);
		console.error(`AUTH_ERROR ${error}`);
		server.close();
		process.exit(2);
	}

	if (!searchParams.has('code')) {
		response.writeHead(400, {'Content-Type': 'text/plain'});
		response.end('No `code` in the URL.');
		return;
	}

	console.error('Got authorization code, exchanging for tokens...');

	try {
		const tokens = await exchange(searchParams.get('code'));
		response.writeHead(200, {'Content-Type': 'text/html'});
		response.end('<h1>Done</h1><p>Refresh token captured. You can close this tab.</p>');

		if (!tokens.refresh_token) {
			console.error('NO_REFRESH_TOKEN in response: ' + JSON.stringify(Object.keys(tokens)));
			console.error('Re-run with prompt=consent, or revoke prior access and try again.');
			server.close();
			process.exit(3);
		}

		writeFileSync(OUT, tokens.refresh_token + '\n', {mode: 0o600});
		console.error(`Refresh token written to ${OUT} (mode 0600).`);
		console.error('scope=' + tokens.scope);
		if (PRINT) console.log('REFRESH_TOKEN=' + tokens.refresh_token);

		server.close();
		process.exit(0);
	} catch (error) {
		response.writeHead(500, {'Content-Type': 'text/plain'});
		response.end(String(error.message));
		console.error('EXCHANGE_FAILED ' + error.message);
		server.close();
		process.exit(4);
	}
});

server.on('error', error => {
	console.error('SERVER_ERROR ' + error.message);
	if (error.code === 'EADDRINUSE') {
		console.error(`Port ${PORT} is busy. Re-run with CWS_PORT=<free port> and add that`);
		console.error('loopback URL to the OAuth client\'s authorised redirect URIs.');
	}
	process.exit(5);
});

server.listen(PORT, '127.0.0.1', () => {
	console.error('Listening on ' + serverUrl);
	console.error('');
	console.error('Open this URL in your browser:');
	console.error('');
	console.error('  ' + authUrl.href);
	console.error('');
});

// Don't hang forever if consent never happens.
setTimeout(() => {
	console.error('TIMEOUT waiting for consent callback');
	process.exit(6);
}, 15 * 60 * 1000).unref?.();
