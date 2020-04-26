<template>
		<el-submenu v-if="value.children" :index="value.label">
			<template slot="title">{{value.label}}</template>
			<template v-if="value.children.length > 0">
				<el-menu-item v-for="(subItem, subIndex) in value.children" :key="index + '-' + subIndex" :index="index + '-' + subIndex" :class="subItem.type">
					<RecursiveMenubar v-if="subItem.children && subItem.children.length > 0" :value="subItem"/>
					<template v-else>
						{{subItem.label}}
					</template>
				</el-menu-item>
			</template>
		</el-submenu>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';
import IMenuEntry from '@/script/interfaces/IMenuEntry';

@Component
export default class RecursiveMenubar extends Vue {
	@Prop(Object) value: IMenuEntry;
	@Prop(Number) index: number;
}
</script>

<style scoped>

</style>
