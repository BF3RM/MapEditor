<template>
    <div class="socket-container">
        <template v-if="output">
            <template v-if="output.socket.name !== 'link' || output.name !== '0'">
                {{ output.name }}
            </template>
        </template>

        <div class="socket" :class="[`socket-${type}`, socket.name] | kebab"
             v-socket:[type]="input ? input : output">
            <span class="icon" v-if="icon">
                <i class="fas" :class="[icon]"></i>
            </span>
        </div>

        <template v-if="input">
            {{ input.name }}
        </template>
    </div>
</template>

<script lang="ts">
import Vue, {PropType} from 'vue';
import {Input, Output, Socket} from 'rete';
// @ts-ignore
import VueRenderPlugin from '../../../lib/rete/vue-render-plugin.common';

export default Vue.extend({
    name: 'Socket',
    mixins: [
        VueRenderPlugin.mixin,
    ],
    props: {
        socket: {
            type: Object as PropType<Socket>,
            required: true,
        },
        input: {
            type: Object as PropType<Input>,
            required: false,
        },
        output: {
            type: Object as PropType<Output>,
            required: false,
        },
        bindSocket: {},
    },
    computed: {
        type(): string {
            if (this.input) {
                return 'input';
            } else if (this.output) {
                return 'output';
            }

            return 'unknown';
        },
        icon(): string | null {
            switch (this.socket.name) {
                case 'link':
                    return 'fa-link';
                case 'event':
                    return 'fa-bell';
                case 'property':
                    return 'fa-arrow-right';
                default:
                    return null;
            }
        },
    },
});
</script>

<style lang="scss" scoped>
@import "/src/variables";

$socket-size: 2rem;

.socket-container {
}

.socket {
  display: inline-block;
  box-sizing: border-box;

  width: $socket-size;
  height: $socket-size;

  margin: $socket-size / 10;
  //border: 1px solid white;
  border-radius: $socket-size / 2;

  vertical-align: middle;

  z-index: 2;

  cursor: pointer;

  .icon {
    width: $socket-size;
    height: $socket-size;
  }

  &.event {
    color: $white;
    background-color: $connection-event-color;
    border-color: $white;

    &:hover {
      background-color: scale-color($connection-event-color, $lightness: 20%);
    }
  }

  &.property {
    color: $white;
    background-color: $connection-property-color;
    border-color: $white;

    &:hover {
      background-color: scale-color($connection-property-color, $lightness: 30%);
    }
  }

  &.link {
    color: $black;
    background-color: $connection-link-color;
    border-color: $white;

    &:hover {
      background-color: scale-color($connection-link-color, $lightness: 70%);
    }
  }
}

.socket.multiple {
  border-color: $white;
}

.socket.socket-output {
  margin-right: -($socket-size / 2);
}

.socket.socket-input {
  margin-left: -($socket-size / 2);
}

</style>
