<template>
	<div class="window-wrapper" v-show="visible">
		<div class="window lm_header">
			<div class="header lm_tab">
				<div class="title">{{ title }}</div>
				<div v-if="isDestructible" class="lm_close_tab" @click="onClose"></div>
			</div>
			<div class="content lm_content">
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
	position: absolute;
	left: 50%;
	top: 50%;
	transform: translate(-50%, -50%);
	display: grid;
	height: 60vh;
	width: 45vw;
	display: flex;
	flex-flow: column;
	z-index: 50;
	border-radius: 6px;
	overflow: hidden;

	.header {
		&.lm_tab {
			margin: 0;
			padding: 5px 15px !important;

			.lm_close_tab {
				width: 28px;
				height: 17px;
				position: absolute;
				top: 0;
				right: 0;
				text-align: center;
			}

			&:hover {
				background: transparent !important;
				color: #7a8797 !important;
			}
		}
	}

	.content {
		padding: 1.5vh;
		height: 100%;
		display: flex;
		flex-flow: column;

		.container {
			flex: 1 1 auto;
			margin-bottom: 1.5vh;
		}

		.footer {
			display: flex;
			flex-flow: row;
			justify-content: flex-end;

			.btn {
				margin-right: 4px;

				&:last-of-type {
					margin: 0;
				}
			}
		}
	}
}
</style>
