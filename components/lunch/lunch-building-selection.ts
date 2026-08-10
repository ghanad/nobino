export type LunchBuildingOption = {
  id: string;
  name: string;
};

export function getLunchBuildingSelection(input: {
  buildings: LunchBuildingOption[];
  currentBuildingId?: string;
  currentBuildingName?: string;
}) {
  const currentBuilding = input.buildings.find(
    (building) => building.id === input.currentBuildingId,
  );
  const hasUnavailableCurrentBuilding = Boolean(
    input.currentBuildingId && !currentBuilding,
  );
  const selectedBuilding = currentBuilding ?? input.buildings[0];

  return {
    currentBuildingName:
      currentBuilding?.name ?? input.currentBuildingName ?? "",
    hasUnavailableCurrentBuilding,
    selectedBuildingId: hasUnavailableCurrentBuilding
      ? ""
      : selectedBuilding?.id ?? "",
    selectedBuildingName: selectedBuilding?.name ?? "",
    shouldShowSelector:
      input.buildings.length > 1 || hasUnavailableCurrentBuilding,
  };
}
