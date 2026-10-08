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

The contract and policy seam are present. Remote admin operations remain disabled until a real CAD-specific backend/Control API and signed device/session flow exist. The central UI must not present simulated approval or remote-edit actions as functional before that backend exists.
