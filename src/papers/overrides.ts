// Paper data the API doesn't have yet, keyed by arXiv id. Anything set here wins over the
// API's value for that paper.
// TODO: move these into the Django admin (Publication.citation / a code URL field) and
// delete this file once the backend serves them.

export type PaperOverride = {
  /** BibTeX, shown by the BibTeX button. */
  citation?: string;
  /** Source code. */
  code?: string;
};

export const OVERRIDES: Record<string, PaperOverride> = {
  // Training-Free Temporal Abstraction for General Video Understanding (Sevan, 2026-10-06).
  "2608.27929": {
    citation: `@misc{casanova2026trainingfreetemporalabstractiongeneral,
      title={Training-Free Temporal Abstraction for General Video Understanding},
      author={Etienne Casanova and Sevan Brodjian and Pietro Perona},
      year={2026},
      eprint={2608.27929},
      archivePrefix={arXiv},
      primaryClass={cs.CV},
      url={https://arxiv.org/abs/2608.27929},
}`,
  },
  // Single-View Seafloor Recovery from Imaging Sonar (the code link on its project page).
  "2605.24195": {
    code: "https://github.com/SevanBrodjian/sonar-inverse-rendering",
  },
};
