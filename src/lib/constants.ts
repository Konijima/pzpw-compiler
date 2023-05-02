const PZPW_ASSETS_DIR = "assets";
const LUA_SHARED_MODULES_DIR = "media/lua/shared";
const LUA_MODULE_DIR = "lua_modules";
const REIMPORT_TEMPLATE = `-- PIPEWRENCH --
if _G.Events.OnPipeWrenchBoot == nil then
  _G.triggerEvent('OnPipeWrenchBoot', false)
end
_G.Events.OnPipeWrenchBoot.Add(function(____flag____)
  if ____flag____ ~= true then return end
  -- {IMPORTS}
end)
----------------`;

enum PZPW_ERRORS {
  TRANSPILE_ERROR = "TRANSPILE ERROR",
  COMPILER_ERROR = "COMPILER_ERROR",
}

export { PZPW_ASSETS_DIR, REIMPORT_TEMPLATE, LUA_SHARED_MODULES_DIR, PZPW_ERRORS, LUA_MODULE_DIR };
