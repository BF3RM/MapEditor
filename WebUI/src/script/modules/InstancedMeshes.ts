/**
 * Draws every copy of a mesh in one call.
 *
 * A level places the same few hundred meshes thousands of times -- MP_001 has 6185 placements drawn
 * from 562 unique meshes. Cloning geometry per placement meant thousands of draw calls, thousands
 * of materials, and a race where a clone taken before its texture arrived kept the neutral one.
 *
 * One geometry per mesh SUBSET, one material, and a matrix per placement removes all three: the GPU
 * draws each subset once however many times it appears, and there is a single material to paint.
 */

import * as THREE from 'three';

interface Batch {
	file: string;
	matrices: THREE.Matrix4[];
}

export class InstancedMeshes {
	private batches = new Map<string, Batch>();
	private group = new THREE.Group();
	private built = 0;
	private instances = 0;

	public constructor() {
		this.group.name = 'instanced';
	}

	/** Record one placement. Nothing is loaded or drawn until build(). */
	public add(file: string, transform: number[]): void {
		let batch = this.batches.get(file);

		if (batch === undefined) {
			batch = { file, matrices: [] };
			this.batches.set(file, batch);
		}

		// right, up, forward, translation -- the basis order the editor's LinearTransform uses.
		batch.matrices.push(new THREE.Matrix4().set(
			transform[0], transform[3], transform[6], transform[9],
			transform[1], transform[4], transform[7], transform[10],
			transform[2], transform[5], transform[8], transform[11],
			0, 0, 0, 1
		));
	}

	public get stats(): { meshes: number; instances: number; drawn: number } {
		return { meshes: this.batches.size, instances: this.instances, drawn: this.built };
	}

	/**
	 * Build the instanced meshes.
	 *
	 * `load` returns the geometry for a file once; the caller owns loading and texturing, so this
	 * module stays about instancing alone.
	 */
	public async build(
		load: (file: string) => Promise<THREE.Object3D | null>,
		adopt?: (file: string, parts: any[]) => void
	): Promise<number> {
		const scene = (window as any).editor.threeManager.scene;

		for (const batch of this.batches.values()) {
			const source = await load(batch.file);

			if (source === null) {
				continue;
			}

			const subsets: THREE.Mesh[] = [];
			source.updateMatrixWorld(true);
			source.traverse((child: any) => {
				if (child.isMesh) {
					subsets.push(child);
				}
			});

			const built: THREE.InstancedMesh[] = [];

			for (const subset of subsets) {
				const mesh = new THREE.InstancedMesh(subset.geometry, subset.material, batch.matrices.length);

				// A subset can sit at an offset inside its own file; fold that in so the instance
				// matrix stays the placement's own transform.
				const local = subset.matrixWorld.clone();

				for (let i = 0; i < batch.matrices.length; i++) {
					mesh.setMatrixAt(i, batch.matrices[i].clone().multiply(local));
				}

				mesh.instanceMatrix.needsUpdate = true;
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				mesh.frustumCulled = false;
				mesh.name = batch.file;

				this.group.add(mesh);
				built.push(mesh);
				this.built++;
			}

			// Hand the batch to the mesh layer so a texture arriving later repaints it too. Without
			// this the instanced copies keep whatever material the original held at build time.
			if (adopt !== undefined && built.length > 0) {
				adopt(batch.file, built);
			}

			this.instances += batch.matrices.length;
		}

		if (this.group.children.length > 0 && this.group.parent === null) {
			scene.add(this.group);
			(window as any).editor.threeManager.setPendingRender();
		}

		return this.built;
	}
}
