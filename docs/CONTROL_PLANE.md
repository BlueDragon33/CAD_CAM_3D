# Quản trị Ứng dụng integration

`CAD_CAM_3D` is a level-1 managed client of the central **Quản trị Ứng dụng** control-plane.

## Ownership boundary

The control-plane manages operational policy; the CAD client owns engineering content.

### The control-plane may manage

- device access metadata and approval state;
- UI/workspace policy;
- feature flags and experimental capability rollout;
- print-policy defaults and safe validation policy;
- runtime/service state;
- filtered operational audit metadata.

### The control-plane must not own or mirror

- CAD project files;
- parametric geometry bodies;
- mesh payloads;
- STL/STEP/3MF exports;
- private design notes;
- raw AI design prompts.

## Device model

The future remote Device Gate uses a dedicated `CAD-` namespace. CAD devices are never inserted into the Bauman, Bơi ếch, Health Care or Hòa nhập Nga registries.

- Desktop: full engineering workspace.
- Tablet/iPad: touch-oriented reduced-density workspace.
- Phone: review/inspection first; authoring remains intentionally limited until interaction quality is proven.

## Interface management

The client exposes a typed management-policy seam at `src/management/policy.ts`. Local defaults keep the app usable when the control-plane is offline. Once the signed remote bridge exists, Quản trị Ứng dụng can override only the allowlisted policy surface.

The central management UI should follow the same approved-admin-device gate and application workspace shell already used by Bauman and other managed apps.

## Current state

The CAD v1 Production client publishes `application-management.contract/v1` at `https://bluedragon33.github.io/CAD_CAM_3D/control/application-management.contract.json`. Its Application Management Production catalog record was enrolled and the live contract probe passed on 2026-10-08: `contractConnected=true`, `runtimeConnected=true`, `managementMode=local-first`, `remoteAdminReady=false`, `credentialConfigured=false`, protocol `application-management.contract/v1`. The catalog can discover, observe and launch the CAD runtime; a generic connection `warning` may still reflect the intentionally absent remote-admin backend rather than a failed contract handshake.

This is a **read/launch-only integration**, not a signed remote-control bridge. CAD continues to own project and manufacturing data. Device registry, approval, blocking, session revocation and remote mutations remain disabled until a real CAD-specific Control API and trusted device/session/audit flow exist. Central UI must not present simulated approval or remote-edit actions as functional. Production evidence: CAD main `e250a175a134d0b88330b25e0aa3f4815a3ab2dc`; Application Management main `1e53634e85c467b35049cb65203d6441bf239c42`; Application Management Production run `37795141964` (success).
