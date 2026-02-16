import { proxySet } from "valtio/utils";

export class WorkspaceStore {
  selectedSegmentIds: Set<string> = proxySet();
  excludedSegmentIds: Set<string> = proxySet();
  isAllSelected = false;

  toggleSelection(id: string) {
    if (this.isAllSelected) {
      if (this.excludedSegmentIds.has(id)) {
        this.excludedSegmentIds.delete(id);
      } else {
        this.excludedSegmentIds.add(id);
      }
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
    this.excludedSegmentIds.clear();
  }

  clearSelection() {
    this.isAllSelected = false;
    this.selectedSegmentIds.clear();
    this.excludedSegmentIds.clear();
  }
}
