<template>
	<div class="highlighter" v-html="highlight()"></div>
</template>

<script lang="ts">
import { defineComponent } from '@vue/composition-api';

export default defineComponent({
    name: 'Highlighter',
    props: {
        text: {
            type: String,
            required: true
        },
        search: {
            type: String,
            required: true
        }
    },
    methods: {
        highlight() {
            if (!this.search) {
                return this.text;
            }
            return this.text.replace(new RegExp(this.search, 'gi'), (match) => {
                return '<span class="highlightText">' + match + '</span>';
            });
        }
    }
});
</script>

<style lang="scss">
.highlighter * {
	display: inline;
}

.highlightText {
	background-color: #fdff32;
}
</style>
