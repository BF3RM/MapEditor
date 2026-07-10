<template>
	<div class="window-wrapper" v-show="visible">
		<div class="window">
			<div class="header">
				<div class="title">{{ title }}</div>
				<div v-if="isDestructible" class="close-btn" @click="onClose"></div>
			</div>
			<div class="content">
				<slot> </slot>
			</div>
		</div>
		<div class="overlay" @click="onClose"></div>
	</div>
</template>
<script lang="ts">
import { defineComponent } from '@vue/composition-api';

export default defineComponent({
    name: 'WindowComponent',
    props: {
        showHeader: {
            type: Boolean,
            default: true
        },
        isDestructible: {
            type: Boolean,
            default: false
        },
        title: {
            type: String,
            default: 'WindowComponent'
        },
        visible: {
            type: Boolean,
            default: true
        },
    },
    methods: {
        onClose() {
            this.$emit('update:visible', false);
        }
    }
});
</script>
<style lang="scss" scoped>
/* Gameface port: pin the wrapper to the whole viewport (inset:0, no vw/vh which are
   unreliable in Cohtml) and center the window with flexbox. */
.window-wrapper {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 1000;
	pointer-events: none;
	display: flex;
	align-items: center;
	justify-content: center;
}
.overlay {
	position: absolute;
	left: 0;
	top: 0;
	bottom: 0;
	right: 0;
	background: rgba(13, 15, 22, 0.78);
	z-index: 40;
	pointer-events: all;
	backdrop-filter: blur(2px);
}

.window {
	/* Centered by the wrapper's flexbox (percentages of the full-screen wrapper, so no
	   vw/vh needed). */
	position: relative;
	width: 62%;
	max-width: 1000px;
	height: 72%;
	max-height: 720px;
	display: flex;
	flex-direction: column;
	z-index: 50;
	border-radius: 6px;
	overflow: hidden;
	/* The .overlays wrapper is pointer-events:none; re-enable events on the window
	   itself so its inputs/buttons are clickable (the backdrop sets its own). */
	pointer-events: auto;

	.header {
		flex: 0 0 auto;
		position: relative;
		margin: 0;
		padding: 8px 15px;
		background: rgba(22, 25, 36, 1);
		color: #8fa6c0;
		font-size: 13px;
		font-weight: 600;

		/* Gameface port: the close "×" drawn as two rotated bars (glyph text — `\00d7`,
		   `&times;` — doesn't render reliably in Cohtml; `content:''` boxes do). */
		.close-btn {
			position: absolute;
			top: 0;
			right: 0;
			width: 40px;
			height: 100%;
			cursor: pointer;

			&::before,
			&::after {
				content: '';
				position: absolute;
				top: 50%;
				left: 50%;
				width: 16px;
				height: 2px;
				margin: 5px 0 0 -8px; /* nudge the X down a bit so it isn't flush with the top edge */
				background: #8fa6c0;
			}
			&::before {
				transform: rotate(45deg);
			}
			&::after {
				transform: rotate(-45deg);
			}
			&:hover::before,
			&:hover::after {
				background: #fff;
			}
		}
	}

	.content {
		flex: 1 1 auto;
		min-height: 0;
		padding: 14px;
		display: flex;
		flex-direction: column;
		background: rgba(31, 38, 51, 0.98);

		.container {
			flex: 1 1 auto;
			min-height: 0; /* allow inner .scrollable to actually scroll */
			margin-bottom: 1.5vh;
		}

		.footer {
			/* Gameface port: pin to natural height + center the buttons so they don't
			   stretch to the full window height (they were rendering as tall bars). */
			flex: 0 0 auto;
			display: flex;
			flex-direction: row;
			align-items: center;
			justify-content: flex-end;
			gap: 6px;
			margin-top: 10px;

			.btn {
				flex: 0 0 auto;
				height: 34px;
				padding: 0 16px;
				display: flex;
				align-items: center;
				justify-content: center;
				border-radius: 6px;
				cursor: pointer;
				white-space: nowrap;
			}
		}
	}
}
</style>
