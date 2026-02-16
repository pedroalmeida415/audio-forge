import { proxySet } from "valtio/utils";

export class WorkspaceStore {
  selectedSegmentIds: Set<string> = proxySet();
  isAllSelected = false;

  toggleSelection(id: string) {
    if (this.isAllSelected) {
      // Exit select-all mode; only this segment stays selected
      this.isAllSelected = false;
      this.selectedSegmentIds.clear();
      this.selectedSegmentIds.add(id);
      return;
    }
    if (this.selectedSegmentIds.has(id)) {
      this.selectedSegmentIds.delete(id);
    } else {
      this.selectedSegmentIds.add(id);
    }
  }

  selectAll() {
    this.isAllSelected = true;
    this.selectedSegmentIds.clear();
  }

  clearSelection() {
    this.isAllSelected = false;
    this.selectedSegmentIds.clear();
  }
}
