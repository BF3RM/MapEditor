<template>
	<div id="page">
		<div class="glHolder">
			<golden-layout class="gl">
				<gl-col :closable="false">
					<gl-row :closable="false">
						<gl-col :closable="false">
							<demo-Stack title="Hierarchy">
							</demo-Stack>
						</gl-col>

						<demo-Stack title="ViewPort">
						</demo-Stack>
						<demo-Stack title="Explorer">
						</demo-Stack>
					</gl-row>
				</gl-col>

			</golden-layout>
		</div>
		<div>
			<h1>End</h1>
		</div>
	</div>
</template>
<script lang="ts">
import Vue from 'vue';

import demoStack from '@/script/components/PlaceholderComponent';
import { Component, Prop } from 'vue-property-decorator';

@Component({ components: { demoStack } })
export default class App extends Vue {
	@Prop() title: string
}
</script>

<style scoped>
	.gl {
		height: 100%;
	}
	.glHolder {
		height:100vh;
		width:100vw;
	}
</style>
