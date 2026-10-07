import "katex/dist/katex.min.css";
import Action from "../../frame/Action";
import AutoVideo from "../../frame/AutoVideo";
import poster from "../assets/sonar-demo-poster.webp";
import overview from "../assets/sonar-overview-dark.webp";
import result from "../assets/sonar-result-dark.webp";
import rmse from "../assets/sonar-rmse-dark.webp";
import { CopyButton, ProjectHead, ProjectRoom } from "../kit";
import { flagshipBySlug } from "../meta";
import SonarDemo from "./SonarDemo";
import * as tex from "./tex";
import "./sonar.css";

const meta = flagshipBySlug["sonar-inverse-rendering"];

const PAPER = "https://arxiv.org/abs/2605.24195";
const CODE = "https://github.com/SevanBrodjian/sonar-inverse-rendering";
const BIBTEX = `@inproceedings{brodjian2026sonar,
  title     = {Single-View Seafloor Recovery from Imaging Sonar
               via Differentiable Rendering},
  author    = {Brodjian, Sevan and Hobley, Michael and Perona, Pietro},
  booktitle = {CVPR Workshops (PBVS)},
  year      = {2026}
}`;

/** Pre-rendered KaTeX (see ./tex.ts). */
function TeX({ html, block = false }: { html: string; block?: boolean }) {
  const Tag = block ? "div" : "span";
  return (
    <Tag className={block ? "sr-math" : undefined} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export default function Page() {
  return (
    <ProjectRoom className="sr">
      <title>{meta.title}</title>
      <ProjectHead
        when="CVPR 2026 Workshops · PBVS · Poster"
        title="Single-View Seafloor Recovery from Imaging Sonar via Differentiable Rendering"
        sub={
          <p className="sr-au">
            <span>
              <b>Sevan Brodjian</b>, Michael Hobley, Pietro Perona
            </span>
            <span className="sr-af">California Institute of Technology</span>
          </p>
        }
        actions={
          <>
            <Action href={PAPER} primary>
              Paper
            </Action>
            <Action href={CODE}>Code</Action>
          </>
        }
      />

      <section className="sr-demo" aria-label="Live demo">
        <SonarDemo />
        <p className="cap">
          A reduced version of the renderer fitting a height field to one simulated sonar frame,
          starting from flat ground. No specular term, no viewpoint prior.
        </p>
      </section>

      <section className="sr-sec" aria-labelledby="sr-video">
        <h2 id="sr-video">Method</h2>
        <div className="sr-body sr-wide">
          <AutoVideo
            className="sr-vid"
            src={[{ src: "/papers/sonar-rendering/sonar-rendering-demo.mp4", type: "video/mp4" }]}
            poster={poster}
            label="The renderer fitting a height field to a target sonar image, then a sphere to a target."
            width={2580}
            height={1080}
          />
          <p className="cap">
            The renderer matches a target sonar image by optimizing a 3D height field with gradient
            descent. In the second half the terrain is frozen and a sphere is placed near a target;
            gradients through the renderer find its position. Sphere fitting is not part of the
            paper.
          </p>
        </div>
      </section>

      <section className="sr-sec" aria-labelledby="sr-abstract">
        <h2 id="sr-abstract">Abstract</h2>
        <div className="sr-body prose">
          <p>
            Forward-looking sonar (FLS) is often the only imaging modality available underwater.
            Each frame collapses vertical structure into a flat range-azimuth image, leaving scene
            elevation ambiguous. Existing 3D recovery pipelines typically require many views,
            multi-sensor rigs, or large quantities of labeled training data.
          </p>
          <p>
            We present a differentiable rendering system for forward-looking imaging sonar. The
            renderer models the full acquisition physics: acoustic ray casting through a 3D scene,
            beam geometry, surface reflectance, Gaussian range binning, and log-amplitude
            compression, all differentiable. This makes the system usable as a component in any
            gradient-based optimization or learning pipeline. We demonstrate it on recovering
            riverbed and seafloor geometry from a <em>single</em> sonar frame with no training data.
            Scene geometry is parameterized as an explicit height field and gradient descent drives
            the simulated image to match the real sensor reading. The system is grounded in real
            sensor parameters and transfers across hardware and environments without modification.
          </p>
        </div>
      </section>

      <section className="sr-sec" aria-labelledby="sr-how">
        <h2 id="sr-how">How it works</h2>
        <div className="sr-body">
          <div className="prose">
            <p>
              Forward-looking sonar sweeps a horizontal arc of acoustic beams across a scene. Each
              beam fans out vertically, covering a wide range of elevation angles. The sensor
              records the range and azimuth of each return, but elevation is lost: different
              geometries can collapse into the same flat image.
            </p>
          </div>
          <figure className="sr-fig mx">
            <img
              src={overview}
              width={2000}
              height={818}
              loading="lazy"
              alt="The sonar sampling geometry from the side, from above and in isometric view, and a sonar frame in polar and Cartesian coordinates."
            />
          </figure>
          <p className="cap">
            (a) Side, (b) top-down and (c) isometric views: discrete azimuthal beams with continuous
            elevation extent, projected onto the horizontal plane. (d) A sonar image in polar and
            Cartesian coordinates.
          </p>
          <div className="prose sr-after">
            <p>
              The seafloor is an explicit height field aligned to the sonar's polar sampling grid,
              and the full ray-casting process is simulated in PyTorch. Every beam, intersection and
              reflectance calculation is differentiable, so the rendered image can be compared with
              the real reading and the error backpropagated through the whole pipeline. After around
              150 optimization steps the recovered height field reproduces the observed image. The
              reflectance at each ray-surface intersection combines diffuse and specular terms:
            </p>
            <TeX block html={tex.reflectance} />
            <p>
              where <TeX html={tex.mu} /> sets the diffuse falloff and <TeX html={tex.sigma} /> the
              width of the specular lobe. Gaussian binning spreads returns across range bins, and
              the result is log-compressed, as in standard sonar processing.
            </p>
            <p>
              A single view can be fit by geometry that only explains this exact angle. Conditioning
              on a known base-plane tilt and a generic-viewpoint assumption keeps the fit to
              geometry consistent with a range of natural viewpoints, and a total-variation prior
              favours smooth surfaces.
            </p>
          </div>
        </div>
      </section>

      <section className="sr-sec" aria-labelledby="sr-results">
        <h2 id="sr-results">Results</h2>
        <div className="sr-body">
          <figure className="sr-fig mx">
            <img
              src={result}
              width={2000}
              height={839}
              loading="lazy"
              alt="A real sonar reading, the reconstructed render, and the recovered 3D height field mesh for a river scene."
            />
          </figure>
          <p className="cap">
            A reading from a Didson sonar (left), the render after 150 optimization steps (centre),
            and the recovered height field (right). The same parameters for every scene.
          </p>
          <div className="prose sr-after">
            <p>
              On synthetic in-distribution data, a supervised U-Net trained on 10,000 labeled frames
              achieves lower error: it can learn the dataset's statistics. Out of distribution this
              changes. The method outperforms the CNN on the HoloOcean benchmark across all metrics
              and stays close on rough terrain, without seeing those conditions during development.
            </p>
          </div>
          <div className="sr-tbl-wrap">
            <table className="sr-tbl">
              <caption>HoloOcean, out of distribution. Lower is better, in cm.</caption>
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
                <tr className="sr-ours">
                  <th scope="row">Ours, generic view</th>
                  <td>0.671</td>
                  <td>0.830</td>
                  <td>0.717</td>
                </tr>
              </tbody>
            </table>
          </div>
          <figure className="sr-fig sr-narrow mx">
            <img
              src={rmse}
              width={1400}
              height={870}
              loading="lazy"
              alt="CNN 3D RMSE on three test sets against the number of training samples, on log axes, with the training-free method as constant dashed lines."
            />
          </figure>
          <p className="cap">
            CNN error on three test sets against training-set size; means over five runs with 95%
            intervals. The training-free method (dashed) is constant. The supervised model wins only
            beyond roughly 100 to 1,000 labelled samples.
          </p>
          <div className="prose sr-after">
            <p>
              A reconstruction takes 5 to 15 seconds on an RTX 5090. The same pipeline applies
              directly to ARIS and Didson captures from the Nushagak, Eel and Kenai rivers without
              retraining or fine-tuning.
            </p>
          </div>
        </div>
      </section>

      <section className="sr-sec" aria-labelledby="sr-cite">
        <h2 id="sr-cite">Citation</h2>
        <div className="sr-body">
          <pre className="bib">
            <code>{BIBTEX}</code>
            <CopyButton text={BIBTEX} />
          </pre>
        </div>
      </section>
    </ProjectRoom>
  );
}
