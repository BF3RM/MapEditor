<template>
    <div id="wrapper">
        <header class="section">
            <nav class="breadcrumb">
                <ul class="container">
                    <li>
                        <router-link to="/">Index</router-link>
                    </li>

                    <li v-for="crumb in breadcrumbs">
                        <router-link :to="crumb.url">
                            {{ crumb.name }}
                        </router-link>
                    </li>
                </ul>
            </nav>
        </header>

        <section class="section">
            <router-view :key="$route.path" class="container"></router-view>
        </section>

        <footer class="section footer">
            <div class="columns">
                <div class="column breadcrumb is-centered has-bullet-separator">
                    <ul>
                        <li>
                            <a href="https://github.com/Rylius/EBX-Viewer">Source Code</a>
                        </li>
                        <li>
                            <a href="https://github.com/EmulatorNexus/Venice-EBX">Venice-EBX</a>
                        </li>
                    </ul>
                </div>

                <div class="column is-narrow breadcrumb is-centered has-bullet-separator">
                    <ul>
                        <li>
                            <span>Created by Ry</span>
                        </li>
                        <li>
                            <a href="https://twitter.com/rylius" rel="noopener noreferrer">Twitter</a>
                        </li>
                        <li>
                            <a href="https://queer.party/@Ry" rel="noopener noreferrer">Mastodon</a>
                        </li>
                        <li>
                            <a href="https://rylius.itch.io/" rel="noopener noreferrer">itch.io</a>
                        </li>
                    </ul>
                </div>

                <div class="column breadcrumb is-centered has-bullet-separator">
                    <ul>
                        <li>
                            <span class="icon flag-rainbow" title="LGBTIAQ+ pride"></span>
                        </li>
                        <li>
                            <span class="icon flag-nonbinary" title="Non-binary representation 💜"></span>
                        </li>
                        <li>
                            <span class="icon flag-trans" title="Trans rights are human rights"></span>
                        </li>
                        <li>
                            <span class="icon flag-asexuality" title="Asexual awareness"></span>
                        </li>
                    </ul>
                </div>
            </div>
        </footer>
    </div>
</template>

<script lang="ts">
import Vue from 'vue';
import { capitalize, removeExtension } from '../filters';

export default Vue.extend({
	name: 'Viewer',
	data(): { footer: number } {
		return {
			footer: Math.floor(Math.random() * 4)
		};
	},
	computed: {
		game() {
			return this.$route.params.game;
		},
		breadcrumbs() {
			const path = this.$route.path;
			if (!path) {
				return [];
			}

			const crumbs = [];
			let currentPath = '';
			const parts = path.split('/');
			parts.shift();
			parts.shift();
			for (const part of parts) {
				let name = part;
				// Capitalize the game name
				if (crumbs.length <= 0) {
					name = capitalize(name);
				} else if (crumbs.length === parts.length - 1) {
					name = removeExtension(name);
				}

				currentPath += part;
				crumbs.push({
					url: `/view/${currentPath}`,
					name
				});
				currentPath += '/';
			}

			return crumbs;
		}
	}
});
</script>
