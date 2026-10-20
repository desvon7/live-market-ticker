# Live Market Ticker

Three details I would not compromise on

Logos: Use a maintained, verified logo mapping so that each ticker displays the correct company identity.

Live updates: Use a backend WebSocket connection and an entitled market-data feed, not simulated price animations.

Bottom ticker: Keep it as a dedicated transparent overlay route so it can run independently in OBS while your control dashboard stays private.

One final technical note: because this is a hosted application, the ticker can keep running while the dashboard is closed, provided the hosting service, backend, and data connection remain available.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/57207cd6-1c82-4baf-a670-97d442b45f5d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
