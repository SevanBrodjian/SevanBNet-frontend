import type { SceneMaker } from "../engine";
import { door } from "./door";
import { jungle } from "./jungle";
import { lake } from "./lake";
import { machine } from "./machine";
import { made } from "./made";

/** The scenes, by name, in the order they play. */
export const SCENES: Record<string, SceneMaker> = { door, jungle, made, machine, lake };
export const ORDER = ["door", "jungle", "made", "machine", "lake"];
