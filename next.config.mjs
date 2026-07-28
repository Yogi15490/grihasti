/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Emit a self-contained server bundle for the Docker runtime stage, so the
  // production image doesn't ship node_modules or the build toolchain.
  output: "standalone",

  // PGlite ships a WASM Postgres build used only by the zero-setup local dev
  // mode (src/lib/localdb.ts). It must stay external to the server bundle —
  // bundling the .wasm asset breaks it. Production runs on `pg`.
  serverExternalPackages: ["@electric-sql/pglite"],
};
export default nextConfig;
