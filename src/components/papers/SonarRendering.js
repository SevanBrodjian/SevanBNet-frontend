import React, { useEffect, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './SonarRendering.css';

function Math({ tex, block = false }) {
  const html = useMemo(
    () => katex.renderToString(tex, { displayMode: block, throwOnError: false, output: 'html' }),
    [tex, block]
  );
  return (
    <span
      className={block ? 'sr-math sr-math-block' : 'sr-math sr-math-inline'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const BIBTEX = `@inproceedings{brodjian2026sonar,
  title     = {Single-View Seafloor Recovery from Imaging Sonar
               via Differentiable Rendering},
  author    = {Brodjian, Sevan and Hobley, Michael and Perona, Pietro},
  booktitle = {CVPR Workshops (PBVS)},
  year      = {2026}
}`;

function SonarRendering() {
  useEffect(() => {
    const prevTitle = document.title;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.title = 'Single-View Seafloor Recovery from Imaging Sonar';
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    return () => {
      document.title = prevTitle;
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

  return (
    <main className="sr-page">
      <div className="sr-grid" aria-hidden="true" />
      <div className="sr-container">
        <div className="sr-eyebrow">
          <svg
            className="sr-pulse"
            width="44"
            height="14"
            viewBox="0 0 44 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M0 7 L8 7 L11 2 L14 12 L17 4 L20 10 L23 7 L44 7" />
          </svg>
          <span>PBVS Workshop · CVPR 2026</span>
        </div>

        <h1 className="sr-title">
          Single-View Seafloor Recovery from Imaging Sonar via Differentiable Rendering
        </h1>

        <p className="sr-authors">
          Sevan Brodjian &nbsp;·&nbsp; Michael Hobley &nbsp;·&nbsp; Pietro Perona
        </p>
        <p className="sr-affil">California Institute of Technology</p>

        <ul className="sr-tags" aria-label="Topics">
          <li>differentiable rendering</li>
          <li>imaging sonar</li>
          <li>bathymetry</li>
        </ul>

        <nav className="sr-links" aria-label="Paper resources">
          <a className="sr-link-btn" href="#" aria-disabled="true" onClick={(e) => e.preventDefault()}>Paper</a>
          <a className="sr-link-btn" href="#" aria-disabled="true" onClick={(e) => e.preventDefault()}>Code</a>
          <a className="sr-link-btn" href="#" aria-disabled="true" onClick={(e) => e.preventDefault()}>Video</a>
          <a className="sr-link-btn" href="#" aria-disabled="true" onClick={(e) => e.preventDefault()}>BibTeX</a>
        </nav>

        <section className="sr-section" aria-labelledby="sr-tldr-h">
          <h2 id="sr-tldr-h"><span className="sr-secnum">§ 01</span> TL;DR</h2>
          <p className="sr-lede">
            A training-free method that recovers underwater seafloor geometry from a
            single forward-looking sonar image in under 30 seconds, by inverting an
            explicit physics-based differentiable sonar renderer.
          </p>
        </section>

        <section className="sr-section" aria-labelledby="sr-abstract-h">
          <h2 id="sr-abstract-h"><span className="sr-secnum">§ 02</span> Abstract</h2>
          <p>
            Forward-looking sonar (FLS) is often the only imaging modality available
            underwater, but each frame collapses vertical structure into a flat
            range–azimuth image, leaving the elevation of the scene ambiguous.
            Existing 3D recovery pipelines typically require many views, multi-sensor
            rigs, or large quantities of labeled training data.
          </p>
          <p>
            We recover bathymetry from a <em>single</em> FLS image without any
            training. We parameterize the seafloor as an explicit height field
            aligned to the sonar&rsquo;s polar sampling grid, then optimize it
            directly so the rendered image matches the observed sensor reading.
            Because the forward model is grounded in sonar physics and parameterized
            by real sensor settings, the same method transfers across hardware and
            environments out of the box.
          </p>
        </section>

        <section className="sr-section" aria-labelledby="sr-method-h">
          <h2 id="sr-method-h"><span className="sr-secnum">§ 03</span> Approach</h2>
          <p>
            For each azimuth beam we cast a dense vertical fan of rays and compute
            soft, differentiable intersections with the latent height field. Each
            ray contributes a backscatter return modeled as a sum of diffuse and
            specular terms,
          </p>
          <Math
            block
            tex={String.raw`f(r,\theta,\phi) = \Big[\, \mu^{\gamma} \;+\; \exp\!\Big(\!-\tfrac{1 - \boldsymbol{\omega}_{\text{refl}}\cdot\boldsymbol{\omega}_{\theta,\phi}}{\sigma_{\text{spec}}^{2}}\Big) \,\Big]\, J,`}
          />
          <p>
            with <Math tex={String.raw`\mu = \max(0, \mathbf{n}_{r,\theta}\!\cdot\!\boldsymbol{\omega}_{\theta,\phi})`} />{' '}
            controlling the diffuse falloff and{' '}
            <Math tex={String.raw`\sigma_{\text{spec}}`} /> the specular lobe width.
            Returns are deposited into range bins via Gaussian weights and compressed
            to log-amplitudes, mirroring real sonar processing.
          </p>
          <p>
            Tilt of the seafloor base-plane is fundamentally ambiguous from a single
            view, so we resample the supporting plane each optimization step under a{' '}
            <em>generic viewpoint</em> assumption — favoring reconstructions that
            stay consistent across small perturbations — and add a total-variation
            prior on the heights to suppress high-frequency artifacts.
          </p>
        </section>

        <section className="sr-section" aria-labelledby="sr-results-h">
          <h2 id="sr-results-h"><span className="sr-secnum">§ 04</span> Results</h2>
          <p>
            On in-distribution synthetic data a supervised U-Net trained on 10,000
            labeled frames wins, as expected. Out of distribution the picture flips:
            our training-free method outperforms the CNN on standard HoloOcean
            scenes across every metric, and stays competitive on rough terrain — all
            without ever seeing the test distribution.
          </p>
          <div className="sr-table-wrap" role="region" aria-label="HoloOcean OOD results">
            <table className="sr-table">
              <caption className="sr-caption">HoloOcean (OOD) &mdash; lower is better. Distances in cm.</caption>
              <thead>
                <tr>
                  <th scope="col">Method</th>
                  <th scope="col">MCD</th>
                  <th scope="col">RMSE</th>
                  <th scope="col">MAE</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Supervised U-Net</th>
                  <td>0.802</td>
                  <td>1.066</td>
                  <td>0.851</td>
                </tr>
                <tr className="sr-row-ours">
                  <th scope="row">Ours (generic view)</th>
                  <td>0.671</td>
                  <td>0.830</td>
                  <td>0.717</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            A single 96 &times; 500 reconstruction takes ~12s on an RTX 5090. We also
            apply the same pipeline directly to ARIS and Didson captures from the
            Nushagak, Eel, and Kenai rivers — no retraining, no fine-tuning.
          </p>
        </section>

        <section className="sr-section" aria-labelledby="sr-cite-h">
          <h2 id="sr-cite-h"><span className="sr-secnum">§ 05</span> Citation</h2>
          <pre className="sr-bibtex" aria-label="BibTeX citation"><code>{BIBTEX}</code></pre>
        </section>

        <footer className="sr-footer">
          <span className="sr-footer-meta">PBVS · CVPR 2026</span>
          <a href="/">sevanb.net</a>
        </footer>
      </div>
    </main>
  );
}

export default SonarRendering;
