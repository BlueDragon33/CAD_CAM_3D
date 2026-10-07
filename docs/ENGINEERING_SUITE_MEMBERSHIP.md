# CAD_CAM_3D — Engineering Suite Membership

Status: **ACTIVE SUITE MEMBER**
Suite authority source: `BlueDragon33/Software-Blueprint-Hub`
Suite manifest branch under review: `foundation/engineering-suite`

## Role

CAD_CAM_3D is the mechanical-design member of the Blue Dragon Engineering Suite.

It remains independently useful and locally operable, while exposing versioned engineering artifacts for future ECAD and CAE products.

## Canonical ownership

CAD_CAM_3D continues to own:

- `CadProject`;
- sketches/constraints;
- feature history;
- semantic topology references;
- mechanical bodies;
- additive-manufacturing intent;
- STEP/STL/3MF outputs.

Suite membership does not transfer project ownership to:

- ECAD_Design;
- CAE_Simulation;
- Application Management;
- a future shared package;
- an AI provider.

## Reserved suite peers

- `BlueDragon33/ECAD_Design` — schematic/PCB/electrical intent.
- `BlueDragon33/CAE_Simulation` — simulation study/result intent.

These repositories may not import CAD source code directly as their integration strategy.

## Interoperability boundary

CAD adapters will follow the suite-level `ENGINEERING-SUITE-INTEROP-CONTRACT.v1`.

First planned CAD-side contracts:

### Mechanical Constraint Package

CAD → ECAD reference data:

- allowed PCB envelope;
- mounting-hole/boss locations;
- connector target zones;
- mechanical keep-outs;
- enclosure clearances;
- explicit Z-up/mm coordinate frame.

### Simulation Geometry Package

CAD → CAE:

- exact source project/revision;
- content hash;
- coordinate frame/units;
- neutral exact geometry or supported solver geometry;
- semantic body/face/edge tags where safe.

### Simulation Result Summary

CAE → CAD reference:

- study/revision;
- exact geometry revision/hash;
- solver/version;
- convergence/evidence state;
- extrema/hotspot references.

CAD may visualize/use summaries for design review, but it does not become the owner of full CAE result fields.

## Coordinate boundary

Suite interchange is right-handed **Z-up**, millimeter for mechanical length unless explicitly declared otherwise.

The current CAD workspace may remain internally Y-up. Adapters are responsible for explicit conversion at suite boundaries.

## Shared-core prohibition

CAD_CAM_3D must not create a new shared-engineering repository merely because ECAD/CAE are planned.

Shared extraction requires at least two real consumers of a stable neutral concept and an explicit versioning/ownership need.

## Product consequence

Current CAD work continues normally.

Suite preparation must not delay useful CAD features unless a CAD decision would permanently violate the suite ownership/interop contracts.
