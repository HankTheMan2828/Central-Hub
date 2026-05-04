export type WordDoc = {
  id: string;
  title: string;
  html: string;
  pageLayoutId?: string;
  pageColorId?: string;
  snippet: string;
  createdAt: number;
  updatedAt: number;
};

export type DocStoreState = {
  version: 2;
  activeId: string | null;
  docs: Record<string, WordDoc>;
};
