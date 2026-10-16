#!/usr/bin/env python3
"""Read-only independent check of browser-downloaded STEP and Core 3MF artifacts.

Uses Python's standard ZIP/XML readers, not the CAD app's serializer.
Checks portable file structure and known smoke-part extents only.
Does NOT claim a slicer import, watertight print, STEP solid reimport or real printer fit.
"""
import math
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

MODEL_NS = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
OPC_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
OPC_RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
ENTRIES = {"[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model"}
MAX_BYTES = 24 * 1024 * 1024


def require(condition, explanation):
    if not condition:
        raise ValueError(explanation)


def read_step(path):
    require(0 < path.stat().st_size <= MAX_BYTES, "STEP payload is empty or over the smoke limit")
    content = path.read_bytes().decode("latin-1").strip()
    require(content.startswith("ISO-10303-21;"), "STEP exchange header is missing")
    require(re.search(r"\bHEADER\s*;", content), "STEP HEADER section is missing")
    require(re.search(r"\bFILE_SCHEMA\s*\(", content), "STEP file schema is missing")
    require(re.search(r"\bDATA\s*;", content), "STEP DATA section is missing")
    require(re.search(r"\bEND-ISO-10303-21;\s*$", content), "STEP exchange trailer is missing")


def read_3mf(path):
    require(0 < path.stat().st_size <= MAX_BYTES, "3MF payload is empty or over the smoke limit")
    with zipfile.ZipFile(path, "r") as archive:
        entries = archive.namelist()
        require(len(entries) == len(ENTRIES) and set(entries) == ENTRIES, "3MF OPC package entry set is invalid")
        require(all(info.file_size <= MAX_BYTES for info in archive.infolist()), "3MF entry exceeds the smoke size limit")
        require(archive.testzip() is None, "3MF ZIP CRC verification failed")

        content_types = ET.fromstring(archive.read("[Content_Types].xml"))
        defaults = content_types.findall(f"{{{OPC_TYPES_NS}}}Default")
        require(any(x.get("Extension") == "model" and
                    x.get("ContentType") == "application/vnd.ms-package.3dmanufacturing-3dmodel+xml"
                    for x in defaults), "3MF model content type is absent")

        relationships = ET.fromstring(archive.read("_rels/.rels"))
        refs = relationships.findall(f"{{{OPC_RELS_NS}}}Relationship")
        require(any(x.get("Target") == "/3D/3dmodel.model" and
                    x.get("Type", "").endswith("/3dmodel") for x in refs),
                "3MF root relationship does not point at the model")

        model = ET.fromstring(archive.read("3D/3dmodel.model"))

    require(model.tag == f"{{{MODEL_NS}}}model", "3MF model namespace is incorrect")
    require(model.get("unit") == "millimeter", "3MF does not declare millimeter units")
    resources = model.find(f"{{{MODEL_NS}}}resources")
    build = model.find(f"{{{MODEL_NS}}}build")
    require(resources is not None and build is not None, "3MF model is missing resources/build")
    objects = resources.findall(f"{{{MODEL_NS}}}object")
    items = build.findall(f"{{{MODEL_NS}}}item")
    require(len(objects) == 2 and len(items) == 2, "Aligned split must create exactly two independent 3MF objects")
    object_ids = [obj.get("id") for obj in objects]
    require(len(set(object_ids)) == 2 and all(object_ids), "3MF object IDs are missing or duplicated")
    require(set(item.get("objectid") for item in items) == set(object_ids),
            "3MF build items do not reference the two mesh objects")

    all_positions = []
    for obj in objects:
        require(obj.get("type") == "model", "3MF resources contain a non-model object")
        mesh = obj.find(f"{{{MODEL_NS}}}mesh")
        require(mesh is not None, "3MF object has no mesh")
        vertices = mesh.find(f"{{{MODEL_NS}}}vertices")
        triangles = mesh.find(f"{{{MODEL_NS}}}triangles")
        require(vertices is not None and triangles is not None, "3MF mesh vertices/triangles are missing")
        positions = []
        for vertex in vertices.findall(f"{{{MODEL_NS}}}vertex"):
            point = tuple(float(vertex.attrib[axis]) for axis in ("x", "y", "z"))
            require(all(math.isfinite(v) for v in point), "3MF contains a non-finite coordinate")
            positions.append(point)
        require(len(positions) >= 3, "3MF mesh contains too few vertices")
        faces = triangles.findall(f"{{{MODEL_NS}}}triangle")
        require(bool(faces), "3MF mesh contains no triangle")
        for face in faces:
            indices = [int(face.attrib[k]) for k in ("v1", "v2", "v3")]
            require(all(0 <= i < len(positions) for i in indices), "3MF triangle index is outside its mesh")
            require(len(set(indices)) == 3, "3MF contains repeated triangle indices")
        all_positions.extend(positions)

    actual = [max(point[i] for point in all_positions) - min(point[i] for point in all_positions)
              for i in range(3)]
    expected = [300.0, 40.0, 12.0]  # browser journey: X width, Y depth, Z height
    require(all(abs(got - want) <= 0.1 for got, want in zip(actual, expected)),
            "3MF dimensions do not match the 300 x 40 x 12 mm browser smoke part in Z-up coordinates")
    require(-0.1 <= min(point[2] for point in all_positions) <= 0.1,
            "3MF manufacturing Z-up build-plane origin is incorrect")
    return len(objects)


def main():
    require(len(sys.argv) == 3, "Usage: manufacturing-artifact-conformance.py <STEP> <aligned-3MF>")
    step, mf = (Path(value) for value in sys.argv[1:])
    read_step(step)
    count = read_3mf(mf)
    print(f"Independent artifact structure PASS | STEP exchange sections | "
          f"3MF OPC/CRC | {count} build objects | 300 x 40 x 12 mm, Z-up")
    print("Scope: structural conformance only; independent slicer/STEP CAD reimport and physical fit NOT VERIFIED")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, zipfile.BadZipFile, ET.ParseError, KeyError) as error:
        print(f"Artifact structure FAIL: {error}", file=sys.stderr)
        sys.exit(1)
