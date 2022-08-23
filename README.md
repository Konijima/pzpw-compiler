# PZPW Compiler

[![Lint](https://github.com/Konijima/pzpw-compiler/actions/workflows/Lint.yml/badge.svg)](https://github.com/Konijima/pzpw-compiler/actions/workflows/Lint.yml)
[![Build](https://github.com/Konijima/pzpw-compiler/actions/workflows/Build.yml/badge.svg)](https://github.com/Konijima/pzpw-compiler/actions/workflows/Build.yml)
[![npm version](https://badge.fury.io/js/pzpw-compiler.svg)](https://badge.fury.io/js/pzpw-compiler)

<br>

[NPM](https://www.npmjs.com/search?q=pzpw) | [PZPW](https://github.com/Konijima/pzpw) | [Template](https://github.com/Konijima/pzpw-template) | [Compiler](https://github.com/Konijima/pzpw-compiler) | [Donation](https://paypal.me/Konijima)
|---|---|---|---|---|

<br>

# Requirements

To install and use PZPW Compiler you need NodeJS and NPM.
- [Download NodeJS + NPM](https://nodejs.org/en/download/)  
*Latest LTS Version: 16.17.0 (includes npm 8.15.0)*

<br>

# Installation

Install globally using npm:
```yml
npm install -g pzpw-compiler
```

<br>

# Commands

Compile all mods.  
> *Optionally specify the mod ids to compile.*
```yml
pzpw-compiler mods <mod1> <mod2>
```

Compile mods into workshop.  
> *Optionally specify the mod ids to compile.*
```yml
pzpw-compiler workshop <mod1> <mod2>
```

Get, set or unset game cachedir.
```yml
pzpw-compiler cachedir <get|set|unset> <path>
```

Update PZPW Compiler.
```yml
pzpw-compiler update
```

Get help about commands.
```yml
pzpw-compiler help <command>
```

Clean cachedir generated files.
```yml
pzpw-compiler clean <all|mods|workshop>
```

Print the current version.
```yml
pzpw-compiler version
```

<br>

> Apache License Version 2.0  
> Copyright 2022 Konijima  
