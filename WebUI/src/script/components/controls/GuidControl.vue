<template>
	<!-- A Guid is an identity, not something you free-type. Show it read-only and
	     let a click copy it to the clipboard (same affordance as the Details guids). -->
	<div class="GuidControl" :title="copied ? 'Copied!' : 'Click to copy'" @click="copy">
		<span class="guid-text">{{ display }}</span>
		<span class="copy-hint">{{ copied ? '✓' : '⧉' }}</span>
	</div>
</template>

<script lang="ts">
import { defineComponent } from '@vue/composition-api';

export default defineComponent({
    name: 'GuidControl',
    props: {
        value: {
            // Guid arrives as a string ($value) from the serializer.
            required: false,
            default: ''
        }
    },
    data() {
        return {
            copied: false
        };
    },
    computed: {
        display(): string {
            const v = this.value;
            if (v === null || v === undefined || v === '') {
                return '(none)';
            }
            return String(v);
        }
    },
    methods: {
        copy() {
            const text = this.display;
            if (text === '(none)') {
                return;
            }
            try {
                navigator.clipboard.writeText(text);
                this.copied = true;
                setTimeout(() => {
                    this.copied = false;
                }, 1200);
            } catch (e) {
                // Clipboard may be unavailable in Gameface; failing silently is fine.
            }
        }
    }
});
</script>

<style lang="scss" scoped>
.GuidControl {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 6px;
	width: 100%;
	cursor: pointer;
	font-family: 'Consolas', 'Menlo', monospace;
	font-size: 11px;
	color: #8da1b6;
	overflow: hidden;

	&:hover {
		color: #dfe4ea;
	}

	.guid-text {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.copy-hint {
		flex: 0 0 auto;
		color: #037fff;
		font-size: 12px;
	}
}
</style>
