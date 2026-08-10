import assert from "node:assert/strict";
import { test } from "node:test";

import { getLunchLocationSelection } from "@/components/lunch/lunch-location-selection";

const buildings = [
  { id: "building-a", name: "ساختمان A" },
  { id: "building-b", name: "ساختمان B" },
];

test("new lunch reservations preserve the current building selection behavior", () => {
  assert.deepEqual(
    getLunchLocationSelection({ buildings: [buildings[0]] }),
    {
      currentBuildingName: "",
      hasUnavailableCurrentBuilding: false,
      selectedBuildingId: "building-a",
      selectedBuildingName: "ساختمان A",
      shouldShowSelector: false,
    },
  );
  assert.deepEqual(
    getLunchLocationSelection({ buildings }),
    {
      currentBuildingName: "",
      hasUnavailableCurrentBuilding: false,
      selectedBuildingId: "building-a",
      selectedBuildingName: "ساختمان A",
      shouldShowSelector: true,
    },
  );
});

test("existing lunch reservations keep a valid building selected", () => {
  const selection = getLunchLocationSelection({
    buildings,
    currentLocationId: "building-b",
    currentLocationName: "ساختمان B",
  });

  assert.equal(selection.hasUnavailableCurrentBuilding, false);
  assert.equal(selection.selectedBuildingId, "building-b");
  assert.equal(selection.selectedBuildingName, "ساختمان B");
});

test("an unavailable current building never falls back to the first active building", () => {
  const selection = getLunchLocationSelection({
    buildings,
    currentLocationId: "retired-building",
    currentLocationName: "ساختمان قدیمی",
  });

  assert.equal(selection.hasUnavailableCurrentBuilding, true);
  assert.equal(selection.currentBuildingName, "ساختمان قدیمی");
  assert.equal(selection.selectedBuildingId, "");
  assert.equal(selection.shouldShowSelector, true);
});
