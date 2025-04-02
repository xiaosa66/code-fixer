// 缺少类型注解的变量
const name = 'test'
const age = 25
const isActive = true

// 缺少类型注解的函数
function add(a, b) {
  return a + b
}

// 缺少类型注解的类
class User {
  constructor(name, age) {
    this.name = name
    this.age = age
  }

  getInfo() {
    return `${this.name} is ${this.age} years old`
  }
}

// 使用未定义的变量
console.log(undefinedVariable)

// 使用 let 而不是 const
let shouldBeConst = 'test'
shouldBeConst = 'changed'

// 使用 == 而不是 ===
if (age == '25') {
  console.log('age is 25')
} 