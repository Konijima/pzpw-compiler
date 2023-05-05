const PZPW_ASSETS_DIR = "assets";
const LUA_SHARED_MODULES_DIR = "media/lua/shared";
enum PZPW_ERRORS {
  TRANSPILE_ERROR = "TRANSPILE ERROR",
  COMPILER_ERROR = "COMPILER_ERROR",
  COMPILER_WARN = "COMPILER_WARN",
}

enum ModuleScope {
  shared = "shared",
  client = "client",
  server = "server",
  global = "global",
  lua_module = "lua_modules"
}

export { PZPW_ASSETS_DIR, LUA_SHARED_MODULES_DIR, PZPW_ERRORS, ModuleScope };
