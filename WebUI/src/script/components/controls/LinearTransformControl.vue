<template>
	<div class="transformControls" v-if="value">
		<div class="pos-control">
			<Vec3Control
				class="lt-row-control"
				label="Position"
				:hideLabel="hideLabel"
				:value="value.position"
				:step="0.014"
				@input="onChangePosition"
				@blur="$emit('blur')"
				@dragstart="$emit('dragstart')"
				@dragend="$emit('dragend')"
			/>
			<div class="actions">
				<div class="copy-btn" v-tooltip="'Copy position'" @click="onCopy('position')">
					<img class="action-icon" :src="copyIcon" alt="" />
				</div>
				<div class="paste-btn" v-tooltip="'Paste position'" @click="onPaste('position')">
					<img class="action-icon" :src="pasteIcon" alt="" />
				</div>
			</div>
		</div>
		<div class="rot-control">
			<QuatControl
				class="lt-row-control"
				label="Rotation"
				mode="Euler"
				:hideLabel="hideLabel"
				:value="value.rotation"
				:step="0.14"
				@input="onChangeRotation"
				@blur="$emit('blur')"
				@dragstart="$emit('dragstart')"
				@dragend="$emit('dragend')"
			/>
			<div class="actions">
				<div class="copy-btn" v-tooltip="'Copy rotation'" @click="onCopy('rotation')">
					<img class="action-icon" :src="copyIcon" alt="" />
				</div>
				<div class="paste-btn" v-tooltip="'Paste rotation'" @click="onPaste('rotation')">
					<img class="action-icon" :src="pasteIcon" alt="" />
				</div>
			</div>
		</div>
		<div class="scale-control">
			<Vec3Control
				class="lt-row-control"
				label="Scale"
				:hideLabel="hideLabel"
				:value="value.scale"
				:min="0.01"
				:step="0.014"
				@input="onChangeScale"
				@blur="$emit('blur')"
				@dragstart="$emit('dragstart')"
				@dragend="$emit('dragend')"
			/>
			<div class="actions">
				<div class="copy-btn" v-tooltip="'Copy scale'" @click="onCopy('scale')">
					<img class="action-icon" :src="copyIcon" alt="" />
				</div>
				<div class="paste-btn" v-tooltip="'Paste scale'" @click="onPaste('scale')">
					<img class="action-icon" :src="pasteIcon" alt="" />
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
/* eslint-env node, browser */
import Vec3Control from '@/script/components/controls/Vec3Control.vue';
import QuatControl from '@/script/components/controls/QuatControl.vue';
import { Vec3 } from '@/script/types/primitives/Vec3';
import { Quat } from '@/script/types/primitives/Quat';
import { LinearTransform } from '@/script/types/primitives/LinearTransform';

import { defineComponent } from '@vue/composition-api';

// MODULE-SCOPED clipboard (resolves the old "TODO: Instead of localStorage we must use a state!"
// scaffolding in Vec3Control). Component data would be wiped every time the Inspector re-mounts
// (which happens on every reselection), and localStorage would need a JSON round-trip and leaks
// across editor sessions. A module-scoped object outlives every re-mount and stays typed.
const clipboard: { position: Vec3 | null; rotation: Quat | null; scale: Vec3 | null } = {
    position: null,
    rotation: null,
    scale: null
};

// Icons resolved once (same `require` pattern as ExpandableTreeSlot.vue).
const COPY_ICON = require('@/icons/editor/new/copy.svg');
const PASTE_ICON = require('@/icons/editor/new/paste.svg');

type TransformPart = 'position' | 'rotation' | 'scale';

export default defineComponent({
    name: 'LinearTransformControl',
    components: {
        Vec3Control,
        QuatControl
    },
    props: {
        value: {
            type: Object as () => LinearTransform,
            required: true
        },
        hideLabel: {
            type: Boolean,
            default: false
        },
        parentTransform: {
            type: Object as () => LinearTransform,
            default: null
        }
    },
    computed: {
        copyIcon(): string {
            return COPY_ICON;
        },
        pasteIcon(): string {
            return PASTE_ICON;
        }
    },
    methods: {
        onChangePosition(newPos: Vec3) {
            const newVal = this.value.clone();
            newVal.position = newPos;

            this.$emit('input', newVal);
        },
        onChangeScale(newScale: Vec3) {
            const newVal = this.value.clone();
            newVal.scale = newScale;

            this.$emit('input', newVal);
        },
        onChangeRotation(newRotation: Quat) {
            const newVal = this.value.clone();
            newVal.rotation = newRotation;
            this.$emit('input', newVal);
        },
        onCopy(part: TransformPart) {
            switch (part) {
                case 'position':
                    clipboard.position = this.value.position.clone();
                    break;
                case 'rotation':
                    clipboard.rotation = this.value.rotation.clone();
                    break;
                case 'scale':
                    clipboard.scale = this.value.scale.clone();
            }
        },
        onPaste(part: TransformPart) {
            const newVal = this.value.clone();

            switch (part) {
                case 'position':
                    if (!clipboard.position) return;
                    newVal.position = clipboard.position.clone();
                    break;
                case 'rotation':
                    if (!clipboard.rotation) return;
                    newVal.rotation = clipboard.rotation.clone();
                    break;
                case 'scale':
                    if (!clipboard.scale) return;
                    newVal.scale = clipboard.scale.clone();
            }

            this.$emit('input', newVal);
            // MUST also emit `dragend`. The parent's `input` handler (InspectorComponent.onInput)
            // only moves the selection CLIENT-side; the undoable SetTransformCommand is created by
            // the `dragend` handler (onEndDrag -> SelectionGroup.onClientOnlyMoveEnd). Without this
            // second emit the paste would show up in the viewport and then be lost on save.
            this.$emit('dragend');
        }
    }
});
</script>

<style lang="scss" scoped>
/* Gameface-safe: flexbox only, no grid / :not() / pseudo-elements. */
.pos-control,
.rot-control,
.scale-control {
	display: flex;
	flex-flow: row nowrap;
	align-items: center;
	gap: 4px;
}

.lt-row-control {
	flex: 1 1 auto;
	min-width: 0;
}

.actions {
	flex: 0 0 auto;
	display: flex;
	flex-flow: row nowrap;
	align-items: center;

	.copy-btn,
	.paste-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		box-sizing: border-box;
		padding: 3px;
		background: #037fff;
		border-radius: 3px;
		cursor: pointer;
	}

	.copy-btn {
		margin-right: 4px;
	}

	/* The <img> must not swallow the click: in Gameface a click on a child <img> does not
	   reliably bubble to the parent div's @click handler (same reason .tool-icon in
	   EditorToolbar is pointer-events:none). */
	.action-icon {
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
}
</style>
