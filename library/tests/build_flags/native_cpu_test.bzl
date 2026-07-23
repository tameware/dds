"""Analysis tests for the native-CPU opt-in in DDS_CPPOPTS.

The default build must stay portable across CPU generations
(-mtune=generic on macOS). -mcpu=native is an opt-in for users who
compile on the machine they run on: --//:native_cpu=true.
"""

load("@bazel_skylib//lib:unittest.bzl", "analysistest", "asserts")

def _compile_argv(env):
    for action in analysistest.target_actions(env):
        if action.mnemonic == "CppCompile":
            return action.argv
    analysistest.fail(env, "no CppCompile action found on fixture target")
    return []

def _default_is_portable_test_impl(ctx):
    env = analysistest.begin(ctx)
    argv = _compile_argv(env)
    asserts.true(
        env,
        "-mtune=generic" in argv,
        "default macOS build must tune for the generic CPU model",
    )
    asserts.false(
        env,
        "-mcpu=native" in argv,
        "-mcpu=native must not be enabled by default (breaks binary portability)",
    )
    return analysistest.end(env)

default_is_portable_test = analysistest.make(_default_is_portable_test_impl)

def _native_cpu_opt_in_test_impl(ctx):
    env = analysistest.begin(ctx)
    argv = _compile_argv(env)
    asserts.true(
        env,
        "-mcpu=native" in argv,
        "--define=native_cpu=true must enable -mcpu=native on macOS",
    )
    asserts.false(
        env,
        "-mtune=generic" in argv,
        "-mtune=generic must not override the native tuning",
    )
    return analysistest.end(env)

native_cpu_opt_in_test = analysistest.make(
    _native_cpu_opt_in_test_impl,
    config_settings = {
        "@@//:native_cpu": True,
    },
)
