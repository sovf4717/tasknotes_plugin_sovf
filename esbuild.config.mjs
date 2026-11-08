import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const sharedOptions = {
	entryPoints: ["src/main.ts"],
	outfile: "main.js",
	bundle: true,
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	splitting: false,
	external: [
		"obsidian",
		"electron",
		"@codemirror/*",
		"@lezer/*",
		...builtins
	],
	mainFields: ["module", "main"],
	platform: "browser",
	define: {
		"__DEV__": JSON.stringify(!prod)
	}
};

if (prod) {
	// One-shot production build: emit main.js and exit (no watch).
	await esbuild.build(sharedOptions);
	process.exit(0);
} else {
	// Dev: watch for changes and re-bundle.
	const context = await esbuild.context(sharedOptions);
	await context.watch();
}