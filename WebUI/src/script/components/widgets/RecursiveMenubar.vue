<template>
	<el-submenu v-if="value.children" :index="value.label" :show-timeout="10" :hide-timeout="100">
		<template slot="title">{{ value.label }}</template>
		<template v-if="value.children.length > 0">
			<el-menu-item
				v-for="(subItem, subIndex) in value.children"
				:key="index + '-' + subIndex"
				:index="index + '-' + subIndex"
				:class="subItem.type"
			>
				<recursive-menubar v-if="subItem.children && subItem.children.length > 0" :value="subItem" />
				<span v-else>
					{{ subItem.label }}
				</span>
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

<style scoped></style>
