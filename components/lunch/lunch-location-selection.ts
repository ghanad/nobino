export type LunchBuildingOption = {
  id: string;
  name: string;
};

export function getLunchLocationSelection(input: {
  buildings: LunchBuildingOption[];
  currentLocationId?: string;
  currentLocationName?: string;
}) {
  const currentBuilding = input.buildings.find(
    (building) => building.id === input.currentLocationId,
  );
  const hasUnavailableCurrentBuilding = Boolean(
    input.currentLocationId && !currentBuilding,
  );
  const selectedBuilding = currentBuilding ?? input.buildings[0];

  return {
    currentBuildingName:
      currentBuilding?.name ?? input.currentLocationName ?? "",
    hasUnavailableCurrentBuilding,
    selectedBuildingId: hasUnavailableCurrentBuilding
      ? ""
      : selectedBuilding?.id ?? "",
    selectedBuildingName: selectedBuilding?.name ?? "",
    shouldShowSelector:
      input.buildings.length > 1 || hasUnavailableCurrentBuilding,
  };
}
