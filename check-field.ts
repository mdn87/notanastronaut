import { makeObstacleField } from './src/core/field';

const field = makeObstacleField(1981);
console.log('Field length (seed 1981):', field.length);
console.log('Has greeter at (0,0,130):', field.some((o) => o.pos.x === 0 && o.pos.y === 0 && o.pos.z === 130));
