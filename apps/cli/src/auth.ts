import express from 'express';
import open from 'open';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

dotenv.config();

export const CREDENTIALS_DIR = path.join(os.homedir(), '.quomida');
export const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, 'credentials.json');

export async function login() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        console.error("Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables in .env.");
        console.error("You need a 'Desktop' OAuth client from Google Cloud Console.");
        process.exit(1);
    }

    const app = express();
    const server = app.listen(3000, () => {
        console.log("Listening on http://localhost:3000 for OAuth callback...");
    });

    const redirectUri = 'http://localhost:3000/callback';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20email%20profile%20https://www.googleapis.com/auth/drive.file%20https://www.googleapis.com/auth/drive.appdata&access_type=offline&prompt=select_account`;

    console.log("Opening browser for authentication...");
    await open(authUrl);

    return new Promise<void>((resolve, reject) => {
        app.get('/callback', async (req, res) => {
            const code = req.query.code as string;
            if (!code) {
                res.send("Authentication failed! No code received.");
                server.close();
                return reject(new Error("No code received"));
            }

            res.send("Authentication successful! You can close this tab.");

            try {
                console.log("Exchanging code for token...");
                const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        code,
                        client_id: clientId,
                        client_secret: clientSecret,
                        redirect_uri: redirectUri,
                        grant_type: 'authorization_code'
                    })
                });

                if (!tokenResponse.ok) {
                    const errText = await tokenResponse.text();
                    throw new Error(`Failed to exchange token: ${tokenResponse.status} ${errText}`);
                }

                const tokens = await tokenResponse.json();

                const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${tokens.access_token}` }
                });
                const userInfo = await userResponse.json();

                await fs.mkdir(CREDENTIALS_DIR, { recursive: true });
                await fs.writeFile(CREDENTIALS_PATH, JSON.stringify({
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    expiry_date: Date.now() + tokens.expires_in * 1000,
                    user: {
                        id: userInfo.sub,
                        email: userInfo.email,
                        name: userInfo.name
                    }
                }, null, 2), { mode: 0o600 });

                console.log("Authentication successful and credentials saved to ~/.quomida/credentials.json");
                server.close();
                resolve();
            } catch (err) {
                console.error("Error during token exchange:", err);
                server.close();
                reject(err);
            }
        });
    });
}
