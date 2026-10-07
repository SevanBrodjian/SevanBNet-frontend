// Shapes of the backend API responses used by the site.
export type Project = {
  title: string;
  slug: string;
  start: string;
  end: string | null;
  description: string | null;
  img: string | null;
  link: string | null;
};

export type Publication = {
  id: number;
  title: string;
  authors_str: string | null;
  journal_name: string | null;
  status: string;
  description: string | null;
  url: string | null;
  doi: string | null;
  site_path: string | null;
  publication_date: string | null;
  submission_date: string | null;
  citation: string | null;
};
