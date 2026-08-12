/* global document */

import * as THREE from 'three';
import * as xb from 'xrblocks';

class FixtureExperience extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  xb.add(new FixtureExperience());
  xb.init(new xb.Options());
});
