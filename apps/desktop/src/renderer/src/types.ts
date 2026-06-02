export type HealthState =
  | { status: "loading" }
  | { status: "ready"; timestamp: string }
  | { status: "error"; message: string };

export type Connection = {
  icon: string;
  label: string;
  active?: boolean;
  more?: boolean;
};

export type DatabaseNode = {
  name: string;
  type: "database" | "folder" | "collection";
  depth: number;
  open?: boolean;
};

export type DocumentRow = {
  id: string;
  email: string;
  status: "active" | "pending" | "inactive";
  createdAt: string;
  total: string;
};
