export type WordDoc = {
  id: string;
  title: string;
  html: string;
  pageLayoutId?: string;
  pageColorId?: string;
  orientation?: "portrait" | "landscape";
  marginsId?: string;
  customMargins?: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
  columns?: 1 | 2 | 3;
  fontFamilyId?: string;
  fontSizePt?: number;
  lineSpacing?: number;
  paragraphSpacingBeforePt?: number;
  paragraphSpacingAfterPt?: number;
  snippet: string;
  createdAt: number;
  updatedAt: number;
};

export type DocStoreState = {
  version: 2;
  activeId: string | null;
  docs: Record<string, WordDoc>;
};

export type FolderEntry = {
  name: string;
  path: string;
  docCount: number;
  updatedAt: number;
};

export type DocEntry = Omit<WordDoc, "html"> & {
  path: string;
  size: number;
};

export type OtherEntry = {
  name: string;
  path: string;
  size: number;
  updatedAt: number;
  ext: string;
};

export type BrowseResult = {
  path: string;
  parent: string | null;
  folders: FolderEntry[];
  docs: DocEntry[];
  others: OtherEntry[];
};

export type BackupEntry = {
  reason: string;
  backedUpAt: number;
  path: string;
};
