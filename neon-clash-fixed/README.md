# NEON CLASH

A browser-based 2D stick fighting game built with React, TypeScript, Canvas and Vite.

## Run it locally

Requires Node.js 20+ (22 recommended).

```bash
npm install
npm run dev
```

Open the localhost address Vite prints in the terminal. No domain or paid hosting is required.

For a production build:

```bash
npm run build
```

The resulting `dist/index.html` is a portable single-file build and can be served as a static site.

## Free browser hosting

The repository includes a GitHub Pages workflow in `.github/workflows/deploy.yml`. Push the project to a GitHub repository on the `main` branch, then enable **Settings -> Pages -> GitHub Actions**. GitHub will build and publish the game automatically on each push.

This uses the repository's free GitHub Pages hosting, so you do not need to buy a domain.

## Updated game feel

- Left/right movement no longer doubles as blocking. Hold **DOWN + AWAY** to block, while left/right always moves.
- Ground and air movement use smooth target-velocity acceleration instead of the old fixed impulse.
- Render interpolation smooths the 60 Hz simulation on 60/120/144+ Hz displays.
- Successful hits and supers have stronger, consistent impact feedback.
- Fighter HP is 120 to lengthen rounds and reduce very short burst kills.
- The Orb Ward description now matches its actual automatic trigger behavior.
- Window focus loss clears both held keys and one-frame key presses, preventing stale inputs.
