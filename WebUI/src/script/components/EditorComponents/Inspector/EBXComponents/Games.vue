<template>
    <div>
        Available games:
        <ul>
            <li v-for="pkg in Object.keys($registries)">
                <router-link :to="`/view/${pkg}`">
                    {{ pkg | capitalize }}
                </router-link>
            </li>
        </ul>
    </div>
</template>

<script lang="ts">
import Vue from 'vue';

export default Vue.extend({
    name: 'Games',
});
</script>
