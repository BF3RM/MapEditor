<template>
    <div>
		<div class="columns">
			<div class="column is-2 is-family-code has-text-right">
				<label>
					{{ up.name }}
				</label>
			</div>
			<div class="column">
				<vec3-property :field="up"></vec3-property>
			</div>
		</div>
        <div class="columns">
            <div class="column is-2 is-family-code has-text-right">
                <label>
                    {{ left.name }}
                </label>
            </div>
            <div class="column">
                <vec3-property :field="left"></vec3-property>
            </div>
        </div>
		<div class="columns">
			<div class="column is-2 is-family-code has-text-right">
				<label>
					{{ forward.name }}
				</label>
			</div>
			<div class="column">
				<vec3-property :field="forward"></vec3-property>
			</div>
		</div>
		<div class="columns">
			<div class="column is-2 is-family-code has-text-right">
				<label>
					{{ trans.name }}
				</label>
			</div>
			<div class="column">
				<vec3-property :field="trans"></vec3-property>
			</div>
		</div>
    </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';

import Field from '../../../../types/ebx/Field';

import Vec3Property from './Vec3Property.vue';
import Partition from '../../../../types/ebx/Partition';

export default Vue.extend({
	name: 'LinearTransformProperty',
	props: {
		partition: {
			type: Object as PropType<Partition>,
			required: true
		},
		field: {
			type: Object as PropType<Field<any>>,
			required: true
		}
	},
	computed: {
		trans(): Field<any> {
			return new Field('trans', 'Vec3', this.field.value.trans);
		},
		forward(): Field<any> {
			return new Field('forward', 'Vec3', this.field.value.forward);
		},
		left(): Field<any> {
			return new Field('left', 'Vec3', this.field.value.left);
		},
		up(): Field<any> {
			return new Field('up', 'Vec3', this.field.value.up);
		},
		lua(): string {
			return `LinearTransform(${this.formatVec3(this.field.value.left)}, ${this.formatVec3(this.field.value.up)}, ${this.formatVec3(this.field.value.forward)}, ${this.formatVec3(this.field.value.trans)})`;
		}
	},
	methods: {
		formatVec3(vector: { x: number, y: number, z: number }): string {
			return `Vec3(${vector.x}, ${vector.y}, ${vector.z})`;
		}
	},
	components: {
		Vec3Property
	}
});
</script>

<style lang="scss">

.table.is-normal td {
  border: none;
}

</style>
