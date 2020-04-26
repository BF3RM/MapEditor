<template>
	<span class="highlighter" v-html="highlight()">
	</span>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
@Component
export default class Highlighter extends Vue {
	@Prop(String) private text: string;
	@Prop(String) private search: string;

	private highlight() {
		if (!this.search) {
			return this.text;
		}
		return this.text.replace(new RegExp(this.search, 'gi'), (match) => {
			return '<span class="highlightText">' + match + '</span>';
		});
	}
}
</script>

<style lang="scss">
.highlighter * {
	display: inline;
}

.highlightText {
	background-color: #fdff32;
}
</style>
