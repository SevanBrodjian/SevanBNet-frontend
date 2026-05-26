import React, { useEffect, useState, useRef, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './SonarRendering.css';

/* ─── KaTeX helper ─────────────────────────────────────────────────────── */

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

/* ─── BibTeX ────────────────────────────────────────────────────────────── */

const BIBTEX = `@inproceedings{brodjian2026sonar,
  title     = {Single-View Seafloor Recovery from Imaging Sonar
               via Differentiable Rendering},
  author    = {Brodjian, Sevan and Hobley, Michael and Perona, Pietro},
  booktitle = {CVPR Workshops (PBVS)},
  year      = {2026}
}`;

/* ─── Icons ─────────────────────────────────────────────────────────────── */

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 10 L1 1 L10 1" />
      <rect x="4" y="4" width="9" height="9" rx="1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="1.5 7 4.5 10.5 11.5 2.5" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 9.5A6.5 6.5 0 1 1 5.5 2a4.5 4.5 0 0 0 7.5 7.5z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7.5" cy="7.5" r="2.75" />
      <line x1="7.5" y1="0.75" x2="7.5" y2="2.5" />
      <line x1="7.5" y1="12.5" x2="7.5" y2="14.25" />
      <line x1="0.75" y1="7.5" x2="2.5" y2="7.5" />
      <line x1="12.5" y1="7.5" x2="14.25" y2="7.5" />
      <line x1="2.93" y1="2.93" x2="4.17" y2="4.17" />
      <line x1="10.83" y1="10.83" x2="12.07" y2="12.07" />
      <line x1="10.83" y1="4.17" x2="12.07" y2="2.93" />
      <line x1="2.93" y1="12.07" x2="4.17" y2="10.83" />
    </svg>
  );
}

/* ─── Placeholder (swap out once assets are ready) ─────────────────────── */

function FigPlaceholder({ label }) {
  return (
    <div className="sr-fig-placeholder" aria-hidden="true">
      {label}
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */

function SonarRendering() {
  const [copied, setCopied] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('sr-dark') === '1'; } catch { return false; }
  });
  const videoRef = useRef(null);

  const toggleDark = () => {
    setDarkMode(prev => {
      const next = !prev;
      try { localStorage.setItem('sr-dark', next ? '1' : '0'); } catch {}
      return next;
    });
  };

  /* Page title & scroll unlock */
  useEffect(() => {
    const prevTitle = document.title;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.title = 'Single-View Seafloor Recovery from Imaging Sonar';
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    return () => {
      document.title = prevTitle;
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

  /* Scroll-based fade-in via IntersectionObserver */
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('sr-visible');
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
    );
    document.querySelectorAll('.sr-fade').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  /* Ensure video autoplays (React muted prop quirk workaround) */
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(BIBTEX)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <main className={`sr-page${darkMode ? ' sr-dark' : ''}`}>
      <div className="sr-topbar" aria-hidden="true" />
      <div className="sr-grid" aria-hidden="true" />
      <button
        className="sr-theme-btn"
        onClick={toggleDark}
        aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        title={darkMode ? 'Light mode' : 'Dark mode'}
      >
        {darkMode ? <SunIcon /> : <MoonIcon />}
      </button>

      <div className="sr-container">

        {/* ══ Header ══════════════════════════════════════════════════════ */}
        <header className="sr-header sr-fade">
          <div className="sr-eyebrow">
            <svg className="sr-pulse" width="44" height="14" viewBox="0 0 44 14"
              fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"
              aria-hidden="true">
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

          <nav className="sr-links" aria-label="Paper resources">
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a className="sr-link-btn" 
              href="https://arxiv.org/abs/2605.24195"
              target="_blank" rel="noreferrer">Paper</a>
            <a className="sr-link-btn"
              href="https://github.com/SevanBrodjian/sonar-inverse-rendering"
              target="_blank" rel="noreferrer">Code</a>
            <a className="sr-link-btn" href="#sr-cite-h">BibTeX</a>
          </nav>
        </header>

        {/* ══ Demo animation ══════════════════════════════════════════════ */}
        {/*
          PLACEHOLDER: Drop your mp4 into public/papers/sonar-rendering/sonar_demo.mp4
          The video should show: target sonar | differentiable render | 3D height field
          Second half: terrain frozen, sphere fitting demo.
          No controls. Plays as an inline animation.
        */}
        <div className="sr-demo sr-fade" aria-label="Method demonstration animation">
          <div className="sr-demo-frame">
            <video
              ref={videoRef}
              className="sr-demo-video"
              autoPlay
              loop
              playsInline
              controls
              preload="metadata"
              aria-label="Sonar reconstruction animation"
            >
              <source src="/papers/sonar-rendering/sonar-rendering-demo.mp4" type="video/mp4" />
              {/* Fallback if no video yet: swap out the placeholder below */}
            </video>

            {/* Remove this block once the video is in place */}
            {/* <FigPlaceholder label="sonar_demo.mp4: target sonar / render / 3D height field" /> */}
          </div>

          <p className="sr-fig-caption">
            Our differentiable renderer matches a target sonar image by optimizing a 3D height
            field via gradient descent. In the second half the terrain is frozen and a sphere
            is initialized near a target. Gradient flow through the renderer localizes the sphere
            position. This bonus clip demonstrates the renderer's differentiability beyond height
            fields. Sphere fitting is not part of the paper.
          </p>
        </div>

        {/* ══ § 01 Abstract ═══════════════════════════════════════════════ */}
        <section className="sr-section sr-fade" aria-labelledby="sr-abstract-h">
          <h2 id="sr-abstract-h"><span className="sr-secnum">§ 01</span> Abstract</h2>
          <p>
            Forward-looking sonar (FLS) is often the only imaging modality available
            underwater. Each frame collapses vertical structure into a flat range-azimuth
            image, leaving scene elevation ambiguous. Existing 3D recovery pipelines
            typically require many views, multi-sensor rigs, or large quantities of labeled
            training data.
          </p>
          <p>
            We present a differentiable rendering system for forward-looking imaging sonar.
            The renderer models the full acquisition physics: acoustic ray casting through a
            3D scene, beam geometry, surface reflectance, Gaussian range binning, and
            log-amplitude compression, all differentiable. This makes the system usable as a
            component in any gradient-based optimization or learning pipeline. We demonstrate
            it on recovering riverbed and seafloor geometry from a <em>single</em> sonar frame
            with no training data. Scene geometry is parameterized as an explicit height field
            and gradient descent drives the simulated image to match the real sensor reading.
            The system is grounded in real sensor parameters and transfers across hardware and
            environments without modification.
          </p>
        </section>

        {/* ══ § 02 How It Works ═══════════════════════════════════════════ */}
        <section className="sr-section sr-fade" aria-labelledby="sr-method-h">
          <h2 id="sr-method-h"><span className="sr-secnum">§ 02</span> How It Works</h2>

          <p>
            Forward-looking sonar sweeps a horizontal arc of acoustic beams across the scene.
            Each beam is a dense vertical fan of rays. The sensor records how far each ray
            travels before hitting the seafloor, but not the elevation. Everything above
            the floor collapses into a flat range-azimuth image. Distance and angle come for
            free. Height does not.
          </p>

          {/*
            PLACEHOLDER: Figure 2 from the paper (sonar geometric layout).
            Place image at public/papers/sonar-rendering/fig_sonar_layout.png
            Suggest: export the three-panel figure (side / top / isometric) at 1600px wide.
          */}
          <figure className="sr-figure sr-fade">
            <img
              src="/papers/sonar-rendering/sonar_overview_tp.png"
              alt="Three-panel diagram of the forward-looking sonar sampling geometry: side view showing the vertical elevation fan, top view showing discrete azimuthal beams, and isometric view of the full 3D layout."
              className="sr-fig-img"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            {/* <FigPlaceholder label="fig_sonar_layout.png: Figure 2 (sonar geometry overview)" /> */}
            <figcaption className="sr-fig-caption">
              Sonar geometry. Each beam is a vertical fan of rays (left). The sensor sweeps
              discrete beams across a horizontal arc (center). Together they define a
              range-azimuth sampling grid in which elevation is lost (right).
            </figcaption>
          </figure>

          <p>
            Our method inverts this. We represent the seafloor as an explicit height field
            aligned to the sonar's polar sampling grid, then simulate the full ray-casting
            process in PyTorch. Every beam, every intersection, every reflectance calculation
            is differentiable. We run the renderer, compare against the real sensor reading,
            and backpropagate. After around 150 steps, the height field reproduces the
            observed image.
          </p>

          <p>
            The reflectance at each ray-surface intersection combines diffuse and specular terms:
          </p>

          <Math
            block
            tex={String.raw`f(r,\theta,\phi) = \Big[\, \mu^{\gamma} \;+\; \exp\!\Big(\!-\tfrac{1 - \boldsymbol{\omega}_{\text{refl}}\cdot\boldsymbol{\omega}_{\theta,\phi}}{\sigma_{\text{spec}}^{2}}\Big) \,\Big]\, J,`}
          />

          <p>
            where <Math tex={String.raw`\mu = \max(0,\,\mathbf{n}_{r,\theta}\!\cdot\!\boldsymbol{\omega}_{\theta,\phi})`} />{' '}
            controls diffuse falloff based on surface normal and{' '}
            <Math tex={String.raw`\sigma_{\text{spec}}`} /> sets the specular lobe width.
            Gaussian binning distributes returns across range bins; the result is compressed
            to log-amplitudes, matching standard sonar processing.
          </p>

          <p>
            Recovering geometry from a single view risks producing solutions that fit the
            sensor image but reflect view-specific artifacts rather than real structure.
            We condition on a known base-plane tilt and apply the generic viewpoint
            assumption, which regularizes the optimization to prefer geometry consistent
            with a range of natural viewpoints, not solutions tuned to the exact observation
            angle. A total-variation prior additionally encourages smooth surfaces.
          </p>
        </section>

        {/* ══ § 03 Results ════════════════════════════════════════════════ */}
        <section className="sr-section sr-fade" aria-labelledby="sr-results-h">
          <h2 id="sr-results-h"><span className="sr-secnum">§ 03</span> Results</h2>

          {/*
            PLACEHOLDER: Hero reconstruction (one real-river example).
            Place image at public/papers/sonar-rendering/fig_hero_recon.png
            Layout: sonar sensor image | our render | 3D height field mesh side by side.
          */}
          <figure className="sr-figure sr-fade">
            <img
              src="/papers/sonar-rendering/3d_bigview_channel_tp.png"
              alt="Side-by-side comparison: real sonar sensor reading, our reconstructed render, and recovered 3D height field mesh for a river scene."
              className="sr-fig-img"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            {/* <FigPlaceholder label="fig_hero_recon.png: sensor / render / 3D mesh" /> */}
            <figcaption className="sr-fig-caption">
              Real sensor reading captured with a Didson sonar camera (left), our
              reconstructed image after 150 optimization steps (center), and the recovered
              3D height field (right). No retraining; same model parameters used for all scenes.
            </figcaption>
          </figure>

          <p>
            On synthetic in-distribution data, a supervised U-Net trained on 10,000 labeled
            frames achieves lower error. Supervised learning has the advantage when training
            and test distributions match. Out of distribution,
            the result reverses. Our method outperforms the CNN on the standard HoloOcean
            benchmark across all metrics and stays close on rough terrain, without accessing
            those conditions during development.
          </p>

          <div className="sr-table-wrap" role="region" aria-label="HoloOcean OOD results">
            <table className="sr-table">
              <caption className="sr-caption">
                HoloOcean (OOD). Lower is better. Distances in cm.
              </caption>
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

          {/*
            PLACEHOLDER: Figure 6 from the paper (CNN accuracy vs training set size).
            Place image at public/papers/sonar-rendering/fig_cnn_plot.png
            The log-scale plot showing CNN error on 3 test sets vs training samples,
            with our constant dashed line.
          */}
          <figure className="sr-figure sr-figure--constrained sr-fade">
            <img
              src="/papers/sonar-rendering/rmse_training_plot_tp.png"
              alt="Log-scale plot showing CNN 3D RMSE on three test sets versus number of training samples, with our training-free method shown as a constant dashed line."
              className="sr-fig-img sr-fig-img--constrained"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            {/* <FigPlaceholder label="fig_cnn_plot.png: Figure 6 (CNN accuracy vs training set size)" /> */}
            <figcaption className="sr-fig-caption">
              CNN error on three test sets as a function of training set size. Solid lines
              are means over five independent runs; shaded regions are 95% confidence
              intervals. Our training-free method (dashed) stays constant. The supervised
              model approaches our out-of-distribution error only beyond 100–1,000 samples.
            </figcaption>
          </figure>

          <p>
            A single reconstruction takes 5–15 seconds on an RTX 5090. The same pipeline
            applies directly to ARIS and Didson captures from the Nushagak, Eel, and Kenai
            rivers without retraining or fine-tuning.
          </p>
        </section>

        {/* ══ § 04 Citation ═══════════════════════════════════════════════ */}
        <section className="sr-section sr-fade" aria-labelledby="sr-cite-h">
          <h2 id="sr-cite-h"><span className="sr-secnum">§ 04</span> Citation</h2>
          <div className="sr-bibtex-wrap">
            <button
              className="sr-copy-btn"
              onClick={handleCopy}
              aria-label={copied ? 'Copied' : 'Copy citation to clipboard'}
              title={copied ? 'Copied!' : 'Copy to clipboard'}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
            <pre className="sr-bibtex" aria-label="BibTeX citation">
              <code>{BIBTEX}</code>
            </pre>
          </div>
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
