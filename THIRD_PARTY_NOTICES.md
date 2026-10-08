# Third-party notices

## occt-wasm / OpenCascade Technology (OCCT)

CAD_CAM_3D uses the `occt-wasm` package for its optional exact B-Rep path.

Upstream project: `andymai/occt-wasm`.

According to the upstream project license notice:

- the TypeScript wrapper/build tooling is licensed under **MIT OR Apache-2.0**;
- the compiled WebAssembly output inherits the OCCT license and is distributed under **LGPL-2.1-only**.

The exact CAD kernel is kept behind a replaceable, lazy-loaded WebAssembly boundary rather than being treated as CAD_CAM_3D application source code. Distribution/release packaging must preserve applicable upstream license notices and the ability to replace the covered WebAssembly component where required.

This file is a project integration notice, not a substitute for the upstream license texts. Production release gates must include a dependency/license audit and retain the corresponding third-party license materials.
