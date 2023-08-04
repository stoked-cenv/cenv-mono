#!/usr/bin/env node
/// <reference types="node" />
declare module "blessed" {
    const _exports: typeof import("blessed");
    _exports.test = "hi five";
    export = _exports.widget.element;
    export = _exports.widget.screen;
    export = _exports;
}
declare module "bin/tput" {
    export {};
}
declare module "browser/transform" {
    function _exports(file: any): Transform;
    export = _exports;
    import Transform_1 = require("stream");
    import Transform = Transform_1.Transform;
}
declare module "lib/alias" {
    export namespace bools {
        const auto_left_margin: string[];
        const auto_right_margin: string[];
        const back_color_erase: string[];
        const can_change: string[];
        const ceol_standout_glitch: string[];
        const col_addr_glitch: string[];
        const cpi_changes_res: string[];
        const cr_cancels_micro_mode: string[];
        const dest_tabs_magic_smso: string[];
        const eat_newline_glitch: string[];
        const erase_overstrike: string[];
        const generic_type: string[];
        const hard_copy: string[];
        const hard_cursor: string[];
        const has_meta_key: string[];
        const has_print_wheel: string[];
        const has_status_line: string[];
        const hue_lightness_saturation: string[];
        const insert_null_glitch: string[];
        const lpi_changes_res: string[];
        const memory_above: string[];
        const memory_below: string[];
        const move_insert_mode: string[];
        const move_standout_mode: string[];
        const needs_xon_xoff: string[];
        const no_esc_ctlc: string[];
        const no_pad_char: string[];
        const non_dest_scroll_region: string[];
        const non_rev_rmcup: string[];
        const over_strike: string[];
        const prtr_silent: string[];
        const row_addr_glitch: string[];
        const semi_auto_right_margin: string[];
        const status_line_esc_ok: string[];
        const tilde_glitch: string[];
        const transparent_underline: string[];
        const xon_xoff: string[];
    }
    export namespace numbers {
        const columns: string[];
        const init_tabs: string[];
        const label_height: string[];
        const label_width: string[];
        const lines: string[];
        const lines_of_memory: string[];
        const magic_cookie_glitch: string[];
        const max_attributes: string[];
        const max_colors: string[];
        const max_pairs: string[];
        const maximum_windows: string[];
        const no_color_video: string[];
        const num_labels: string[];
        const padding_baud_rate: string[];
        const virtual_terminal: string[];
        const width_status_line: string[];
        const bit_image_entwining: string[];
        const bit_image_type: string[];
        const buffer_capacity: string[];
        const buttons: string[];
        const dot_horz_spacing: string[];
        const dot_vert_spacing: string[];
        const max_micro_address: string[];
        const max_micro_jump: string[];
        const micro_col_size: string[];
        const micro_line_size: string[];
        const number_of_pins: string[];
        const output_res_char: string[];
        const output_res_horz_inch: string[];
        const output_res_line: string[];
        const output_res_vert_inch: string[];
        const print_rate: string[];
        const wide_char_size: string[];
    }
    export namespace strings {
        const acs_chars: string[];
        const back_tab: string[];
        const bell: string[];
        const carriage_return: string[];
        const change_char_pitch: string[];
        const change_line_pitch: string[];
        const change_res_horz: string[];
        const change_res_vert: string[];
        const change_scroll_region: string[];
        const char_padding: string[];
        const clear_all_tabs: string[];
        const clear_margins: string[];
        const clear_screen: string[];
        const clr_bol: string[];
        const clr_eol: string[];
        const clr_eos: string[];
        const column_address: string[];
        const command_character: string[];
        const create_window: string[];
        const cursor_address: string[];
        const cursor_down: string[];
        const cursor_home: string[];
        const cursor_invisible: string[];
        const cursor_left: string[];
        const cursor_mem_address: string[];
        const cursor_normal: string[];
        const cursor_right: string[];
        const cursor_to_ll: string[];
        const cursor_up: string[];
        const cursor_visible: string[];
        const define_char: string[];
        const delete_character: string[];
        const delete_line: string[];
        const dial_phone: string[];
        const dis_status_line: string[];
        const display_clock: string[];
        const down_half_line: string[];
        const ena_acs: string[];
        const enter_alt_charset_mode: string[];
        const enter_am_mode: string[];
        const enter_blink_mode: string[];
        const enter_bold_mode: string[];
        const enter_ca_mode: string[];
        const enter_delete_mode: string[];
        const enter_dim_mode: string[];
        const enter_doublewide_mode: string[];
        const enter_draft_quality: string[];
        const enter_insert_mode: string[];
        const enter_italics_mode: string[];
        const enter_leftward_mode: string[];
        const enter_micro_mode: string[];
        const enter_near_letter_quality: string[];
        const enter_normal_quality: string[];
        const enter_protected_mode: string[];
        const enter_reverse_mode: string[];
        const enter_secure_mode: string[];
        const enter_shadow_mode: string[];
        const enter_standout_mode: string[];
        const enter_subscript_mode: string[];
        const enter_superscript_mode: string[];
        const enter_underline_mode: string[];
        const enter_upward_mode: string[];
        const enter_xon_mode: string[];
        const erase_chars: string[];
        const exit_alt_charset_mode: string[];
        const exit_am_mode: string[];
        const exit_attribute_mode: string[];
        const exit_ca_mode: string[];
        const exit_delete_mode: string[];
        const exit_doublewide_mode: string[];
        const exit_insert_mode: string[];
        const exit_italics_mode: string[];
        const exit_leftward_mode: string[];
        const exit_micro_mode: string[];
        const exit_shadow_mode: string[];
        const exit_standout_mode: string[];
        const exit_subscript_mode: string[];
        const exit_superscript_mode: string[];
        const exit_underline_mode: string[];
        const exit_upward_mode: string[];
        const exit_xon_mode: string[];
        const fixed_pause: string[];
        const flash_hook: string[];
        const flash_screen: string[];
        const form_feed: string[];
        const from_status_line: string[];
        const goto_window: string[];
        const hangup: string[];
        const init_1string: string[];
        const init_2string: string[];
        const init_3string: string[];
        const init_file: string[];
        const init_prog: string[];
        const initialize_color: string[];
        const initialize_pair: string[];
        const insert_character: string[];
        const insert_line: string[];
        const insert_padding: string[];
        const key_a1: string[];
        const key_a3: string[];
        const key_b2: string[];
        const key_backspace: string[];
        const key_beg: string[];
        const key_btab: string[];
        const key_c1: string[];
        const key_c3: string[];
        const key_cancel: string[];
        const key_catab: string[];
        const key_clear: string[];
        const key_close: string[];
        const key_command: string[];
        const key_copy: string[];
        const key_create: string[];
        const key_ctab: string[];
        const key_dc: string[];
        const key_dl: string[];
        const key_down: string[];
        const key_eic: string[];
        const key_end: string[];
        const key_enter: string[];
        const key_eol: string[];
        const key_eos: string[];
        const key_exit: string[];
        const key_f0: string[];
        const key_f1: string[];
        const key_f10: string[];
        const key_f11: string[];
        const key_f12: string[];
        const key_f13: string[];
        const key_f14: string[];
        const key_f15: string[];
        const key_f16: string[];
        const key_f17: string[];
        const key_f18: string[];
        const key_f19: string[];
        const key_f2: string[];
        const key_f20: string[];
        const key_f21: string[];
        const key_f22: string[];
        const key_f23: string[];
        const key_f24: string[];
        const key_f25: string[];
        const key_f26: string[];
        const key_f27: string[];
        const key_f28: string[];
        const key_f29: string[];
        const key_f3: string[];
        const key_f30: string[];
        const key_f31: string[];
        const key_f32: string[];
        const key_f33: string[];
        const key_f34: string[];
        const key_f35: string[];
        const key_f36: string[];
        const key_f37: string[];
        const key_f38: string[];
        const key_f39: string[];
        const key_f4: string[];
        const key_f40: string[];
        const key_f41: string[];
        const key_f42: string[];
        const key_f43: string[];
        const key_f44: string[];
        const key_f45: string[];
        const key_f46: string[];
        const key_f47: string[];
        const key_f48: string[];
        const key_f49: string[];
        const key_f5: string[];
        const key_f50: string[];
        const key_f51: string[];
        const key_f52: string[];
        const key_f53: string[];
        const key_f54: string[];
        const key_f55: string[];
        const key_f56: string[];
        const key_f57: string[];
        const key_f58: string[];
        const key_f59: string[];
        const key_f6: string[];
        const key_f60: string[];
        const key_f61: string[];
        const key_f62: string[];
        const key_f63: string[];
        const key_f7: string[];
        const key_f8: string[];
        const key_f9: string[];
        const key_find: string[];
        const key_help: string[];
        const key_home: string[];
        const key_ic: string[];
        const key_il: string[];
        const key_left: string[];
        const key_ll: string[];
        const key_mark: string[];
        const key_message: string[];
        const key_move: string[];
        const key_next: string[];
        const key_npage: string[];
        const key_open: string[];
        const key_options: string[];
        const key_ppage: string[];
        const key_previous: string[];
        const key_print: string[];
        const key_redo: string[];
        const key_reference: string[];
        const key_refresh: string[];
        const key_replace: string[];
        const key_restart: string[];
        const key_resume: string[];
        const key_right: string[];
        const key_save: string[];
        const key_sbeg: string[];
        const key_scancel: string[];
        const key_scommand: string[];
        const key_scopy: string[];
        const key_screate: string[];
        const key_sdc: string[];
        const key_sdl: string[];
        const key_select: string[];
        const key_send: string[];
        const key_seol: string[];
        const key_sexit: string[];
        const key_sf: string[];
        const key_sfind: string[];
        const key_shelp: string[];
        const key_shome: string[];
        const key_sic: string[];
        const key_sleft: string[];
        const key_smessage: string[];
        const key_smove: string[];
        const key_snext: string[];
        const key_soptions: string[];
        const key_sprevious: string[];
        const key_sprint: string[];
        const key_sr: string[];
        const key_sredo: string[];
        const key_sreplace: string[];
        const key_sright: string[];
        const key_srsume: string[];
        const key_ssave: string[];
        const key_ssuspend: string[];
        const key_stab: string[];
        const key_sundo: string[];
        const key_suspend: string[];
        const key_undo: string[];
        const key_up: string[];
        const keypad_local: string[];
        const keypad_xmit: string[];
        const lab_f0: string[];
        const lab_f1: string[];
        const lab_f10: string[];
        const lab_f2: string[];
        const lab_f3: string[];
        const lab_f4: string[];
        const lab_f5: string[];
        const lab_f6: string[];
        const lab_f7: string[];
        const lab_f8: string[];
        const lab_f9: string[];
        const label_format: string[];
        const label_off: string[];
        const label_on: string[];
        const meta_off: string[];
        const meta_on: string[];
        const micro_column_address: string[];
        const micro_down: string[];
        const micro_left: string[];
        const micro_right: string[];
        const micro_row_address: string[];
        const micro_up: string[];
        const newline: string[];
        const order_of_pins: string[];
        const orig_colors: string[];
        const orig_pair: string[];
        const pad_char: string[];
        const parm_dch: string[];
        const parm_delete_line: string[];
        const parm_down_cursor: string[];
        const parm_down_micro: string[];
        const parm_ich: string[];
        const parm_index: string[];
        const parm_insert_line: string[];
        const parm_left_cursor: string[];
        const parm_left_micro: string[];
        const parm_right_cursor: string[];
        const parm_right_micro: string[];
        const parm_rindex: string[];
        const parm_up_cursor: string[];
        const parm_up_micro: string[];
        const pkey_key: string[];
        const pkey_local: string[];
        const pkey_xmit: string[];
        const plab_norm: string[];
        const print_screen: string[];
        const prtr_non: string[];
        const prtr_off: string[];
        const prtr_on: string[];
        const pulse: string[];
        const quick_dial: string[];
        const remove_clock: string[];
        const repeat_char: string[];
        const req_for_input: string[];
        const reset_1string: string[];
        const reset_2string: string[];
        const reset_3string: string[];
        const reset_file: string[];
        const restore_cursor: string[];
        const row_address: string[];
        const save_cursor: string[];
        const scroll_forward: string[];
        const scroll_reverse: string[];
        const select_char_set: string[];
        const set_attributes: string[];
        const set_background: string[];
        const set_bottom_margin: string[];
        const set_bottom_margin_parm: string[];
        const set_clock: string[];
        const set_color_pair: string[];
        const set_foreground: string[];
        const set_left_margin: string[];
        const set_left_margin_parm: string[];
        const set_right_margin: string[];
        const set_right_margin_parm: string[];
        const set_tab: string[];
        const set_top_margin: string[];
        const set_top_margin_parm: string[];
        const set_window: string[];
        const start_bit_image: string[];
        const start_char_set_def: string[];
        const stop_bit_image: string[];
        const stop_char_set_def: string[];
        const subscript_characters: string[];
        const superscript_characters: string[];
        const tab: string[];
        const these_cause_cr: string[];
        const to_status_line: string[];
        const tone: string[];
        const underline_char: string[];
        const up_half_line: string[];
        const user0: string[];
        const user1: string[];
        const user2: string[];
        const user3: string[];
        const user4: string[];
        const user5: string[];
        const user6: string[];
        const user7: string[];
        const user8: string[];
        const user9: string[];
        const wait_tone: string[];
        const xoff_character: string[];
        const xon_character: string[];
        const zero_motion: string[];
        const alt_scancode_esc: string[];
        const bit_image_carriage_return: string[];
        const bit_image_newline: string[];
        const bit_image_repeat: string[];
        const char_set_names: string[];
        const code_set_init: string[];
        const color_names: string[];
        const define_bit_image_region: string[];
        const device_type: string[];
        const display_pc_char: string[];
        const end_bit_image_region: string[];
        const enter_pc_charset_mode: string[];
        const enter_scancode_mode: string[];
        const exit_pc_charset_mode: string[];
        const exit_scancode_mode: string[];
        const get_mouse: string[];
        const key_mouse: string[];
        const mouse_info: string[];
        const pc_term_options: string[];
        const pkey_plab: string[];
        const req_mouse_pos: string[];
        const scancode_escape: string[];
        const set0_des_seq: string[];
        const set1_des_seq: string[];
        const set2_des_seq: string[];
        const set3_des_seq: string[];
        const set_a_background: string[];
        const set_a_foreground: string[];
        const set_color_band: string[];
        const set_lr_margin: string[];
        const set_page_length: string[];
        const set_tb_margin: string[];
        const enter_horizontal_hl_mode: string[];
        const enter_left_hl_mode: string[];
        const enter_low_hl_mode: string[];
        const enter_right_hl_mode: string[];
        const enter_top_hl_mode: string[];
        const enter_vertical_hl_mode: string[];
        const set_a_attributes: string[];
        const set_pglen_inch: string[];
    }
}
declare module "lib/blessed" {
    export = blessed;
    /**
     * blessed - a high-level terminal interface library for node.js
     * Copyright (c) 2013-2015, Christopher Jeffrey and contributors (MIT License).
     * https://github.com/chjj/blessed
     */
    /**
     * Blessed
     */
    function blessed(...args: any[]): any;
    namespace blessed {
        export const program: typeof import("blessed/lib/program");
        const Program_1: typeof import("blessed/lib/program");
        export { Program_1 as Program };
        export const tput: typeof import("blessed/lib/tput");
        export const Tput: typeof import("blessed/lib/tput");
        export const widget: typeof import("blessed/lib/widget");
        export const colors: typeof import("blessed/lib/colors");
        export const unicode: typeof import("blessed/lib/unicode");
        export const helpers: typeof import("blessed/lib/helpers");
    }
}
declare module "lib/colors" {
    export function match(r1: any, g1: any, b1: any): any;
    export function RGBToHex(r: any, g: any, b: any): string;
    export function hexToRGB(hex: any): number[];
    export function mixColors(c1: any, c2: any, alpha: any): any;
    export function blend(attr: any, attr2: any, alpha: any): any;
    export namespace blend {
        const _cache: {};
    }
    export const _cache: {};
    export function reduce(color: any, total: any): any;
    export const xterm: string[];
    export const colors: any;
    export const vcolors: any;
    export const ccolors: any;
    export namespace colorNames {
        const _default: number;
        export { _default as default };
        export const normal: number;
        export const bg: number;
        export const fg: number;
        export const black: number;
        export const red: number;
        export const green: number;
        export const yellow: number;
        export const blue: number;
        export const magenta: number;
        export const cyan: number;
        export const white: number;
        export const lightblack: number;
        export const lightred: number;
        export const lightgreen: number;
        export const lightyellow: number;
        export const lightblue: number;
        export const lightmagenta: number;
        export const lightcyan: number;
        export const lightwhite: number;
        export const brightblack: number;
        export const brightred: number;
        export const brightgreen: number;
        export const brightyellow: number;
        export const brightblue: number;
        export const brightmagenta: number;
        export const brightcyan: number;
        export const brightwhite: number;
        export const grey: number;
        export const gray: number;
        export const lightgrey: number;
        export const lightgray: number;
        export const brightgrey: number;
        export const brightgray: number;
    }
    export function convert(color: any): any;
    export const ncolors: any[];
    var cols: any;
    var _cols: any;
    var out: any;
    export { cols as colors, _cols as vcolors, out as ccolors };
}
declare module "lib/events" {
    /**
     * EventEmitter
     */
    export function EventEmitter(): void;
    export class EventEmitter {
        _events: {};
        setMaxListeners(n: any): void;
        _maxListeners: any;
        addListener(type: any, listener: any): void;
        on: any;
        removeListener(type: any, listener: any): void;
        off: any;
        removeAllListeners(type: any): void;
        once(type: any, listener: any): any;
        listeners(type: any): any;
        _emit(type: any, args: any): any;
        emit(type: any, ...args: any[]): any;
    }
}
declare module "lib/gpmclient" {
    export = GpmClient;
    function GpmClient(options: any): GpmClient;
    class GpmClient {
        constructor(options: any);
        __proto__: EventEmitter;
        stop(): void;
        ButtonName(btn: any): "" | "left" | "right" | "middle";
        hasShiftKey(mod: any): boolean;
        hasCtrlKey(mod: any): boolean;
        hasMetaKey(mod: any): boolean;
    }
    import EventEmitter_1 = require("events");
    import EventEmitter = EventEmitter_1.EventEmitter;
}
declare module "lib/helpers" {
    export function merge(a: any, b: any): any;
    export function asort(obj: any): any;
    export function hsort(obj: any): any;
    export function findFile(start: any, target: any): any;
    export function escape(text: any): any;
    export function parseTags(text: any, screen: any): any;
    export function generateTags(style: any, text: any): string | {
        open: string;
        close: string;
    };
    export function attrToBinary(style: any, element: any): any;
    export function stripTags(text: any): any;
    export function cleanTags(text: any): any;
    export function dropUnicode(text: any): any;
}
declare module "lib/keys" {
    /**
     * accepts a readable Stream instance and makes it emit "keypress" events
     */
    export function emitKeypressEvents(stream: any): void;
}
declare module "lib/program" {
    export = Program;
    /**
     * Program
     */
    function Program(options: any, ...args: any[]): Program;
    class Program {
        /**
         * Program
         */
        constructor(options: any, ...args: any[]);
        options: any;
        input: any;
        output: any;
        _logger: fs.WriteStream;
        zero: boolean;
        useBuffer: any;
        x: number;
        y: number;
        savedX: number;
        savedY: number;
        cols: any;
        rows: any;
        scrollTop: number;
        scrollBottom: number;
        _terminal: any;
        isOSXTerm: boolean;
        isiTerm2: boolean;
        isXFCE: boolean;
        isTerminator: boolean;
        isLXDE: boolean;
        isVTE: boolean;
        isRxvt: boolean;
        isXterm: boolean;
        tmux: boolean;
        tmuxVersion: number;
        _buf: string;
        _flush: any;
        __proto__: EventEmitter;
        type: string;
        log(...args: any[]): boolean;
        debug(...args: any[]): boolean;
        _log(pre: any, msg: any): boolean;
        setupDump(): void;
        setupTput(): void;
        _tputSetup: boolean;
        tput: any;
        put: (...args: any[]) => any;
        setTerminal(terminal: any): void;
        has(name: any): any;
        term(is: any): boolean;
        listen(): void;
        _newHandler: (type: any) => void;
        _listenInput(): void;
        _listenOutput(): void;
        destroy(): void;
        _exiting: boolean;
        destroyed: boolean;
        key(key: any, listener: any): void;
        onceKey(key: any, listener: any): void;
        unkey: (key: any, listener: any) => void;
        removeKey(key: any, listener: any): void;
        bindMouse(): void;
        _boundMouse: boolean;
        _bindMouse(s: any, buf: any): void;
        _lastButton: any;
        enableGpm(): void;
        gpm: import("blessed/lib/gpmclient");
        disableGpm(): void;
        bindResponse(): void;
        _boundResponse: boolean;
        _bindResponse(s: any): void;
        response(name: any, text: any, callback: any, noBypass: any, ...args: any[]): any;
        _owrite: (text: any) => any;
        write(text: any): any;
        _buffer(text: any): boolean;
        flush(): void;
        _write(text: any): any;
        _twrite(data: any): any;
        echo: (text: any, attr: any) => any;
        print(text: any, attr: any): any;
        _ncoords(): void;
        setx(x: any): any;
        sety(y: any): any;
        move(x: any, y: any): any;
        omove(x: any, y: any): void;
        rsetx(x: any): any;
        rsety(y: any): any;
        rmove(x: any, y: any): void;
        simpleInsert(ch: any, i: any, attr: any): any;
        repeat(ch: any, i: any): string;
        copyToClipboard(text: any): boolean;
        cursorShape(shape: any, blink: any): boolean;
        cursorColor(color: any): boolean;
        cursorReset: () => boolean;
        resetCursor(): boolean;
        getTextParams(param: any, callback: any): any;
        getCursorColor(callback: any): any;
        /**
         * Normal
         */
        nul(): any;
        bel: () => any;
        bell(): any;
        vtab(): any;
        ff: () => any;
        form(): any;
        kbs: () => any;
        backspace(): any;
        ht: () => any;
        tab(): any;
        shiftOut(): any;
        shiftIn(): any;
        cr: () => any;
        return(): any;
        nel: () => any;
        newline: () => any;
        feed(): any;
        /**
         * Esc
         */
        ind: () => any;
        index(): any;
        ri: () => any;
        reverse: () => any;
        reverseIndex(): any;
        nextLine(): any;
        reset(): any;
        tabSet(): any;
        sc: (key: any) => any;
        saveCursor(key: any): any;
        rc: (key: any, hide: any) => any;
        restoreCursor(key: any, hide: any): any;
        lsaveCursor(key: any): void;
        _saved: any;
        lrestoreCursor(key: any, hide: any): void;
        lineHeight(): any;
        charset(val: any, level: any): any;
        enter_alt_charset_mode: () => any;
        as: () => any;
        smacs(): any;
        exit_alt_charset_mode: () => any;
        ae: () => any;
        rmacs(): any;
        setG(val: any): any;
        /**
         * OSC
         */
        setTitle(title: any): any;
        _title: any;
        resetColors(param: any): any;
        dynamicColors(param: any): any;
        selData(a: any, b: any): any;
        /**
         * CSI
         */
        cuu: (param: any) => any;
        up: (param: any) => any;
        cursorUp(param: any): any;
        cud: (param: any) => any;
        down: (param: any) => any;
        cursorDown(param: any): any;
        cuf: (param: any) => any;
        right: (param: any) => any;
        forward: (param: any) => any;
        cursorForward(param: any): any;
        cub: (param: any) => any;
        left: (param: any) => any;
        back: (param: any) => any;
        cursorBackward(param: any): any;
        cup: (row: any, col: any) => any;
        pos: (row: any, col: any) => any;
        cursorPos(row: any, col: any): any;
        ed: (param: any) => any;
        eraseInDisplay(param: any): any;
        clear(): any;
        el: (param: any) => any;
        eraseInLine(param: any): any;
        sgr: (param: any, val: any) => any;
        attr: (param: any, val: any) => any;
        charAttributes(param: any, val: any): any;
        text(text: any, attr: any): any;
        _attr(param: any, val: any): any;
        fg: (color: any, val: any) => any;
        setForeground(color: any, val: any): any;
        bg: (color: any, val: any) => any;
        setBackground(color: any, val: any): any;
        dsr: (param: any, callback: any, dec: any, noBypass: any) => any;
        deviceStatus(param: any, callback: any, dec: any, noBypass: any): any;
        getCursor(callback: any): any;
        saveReportedCursor(callback: any): any;
        restoreReportedCursor(): any;
        /**
         * Additions
         */
        ich: (param: any) => any;
        insertChars(param: any): any;
        cnl: (param: any) => any;
        cursorNextLine(param: any): any;
        cpl: (param: any) => any;
        cursorPrecedingLine(param: any): any;
        cha: (param: any) => any;
        cursorCharAbsolute(param: any): any;
        il: (param: any) => any;
        insertLines(param: any): any;
        dl: (param: any) => any;
        deleteLines(param: any): any;
        dch: (param: any) => any;
        deleteChars(param: any): any;
        ech: (param: any) => any;
        eraseChars(param: any): any;
        hpa: (param: any, ...args: any[]) => any;
        charPosAbsolute(param: any, ...args: any[]): any;
        hpr: (param: any) => any;
        HPositionRelative(param: any): any;
        da: (param: any, callback: any) => any;
        sendDeviceAttributes(param: any, callback: any): any;
        vpa: (param: any, ...args: any[]) => any;
        linePosAbsolute(param: any, ...args: any[]): any;
        vpr: (param: any) => any;
        VPositionRelative(param: any): any;
        hvp: (row: any, col: any) => any;
        HVPosition(row: any, col: any): any;
        sm: (...args: any[]) => any;
        setMode(...args: any[]): any;
        decset(...args: any[]): any;
        dectcem: () => any;
        cnorm: () => any;
        cvvis: () => any;
        showCursor(): any;
        cursorHidden: boolean;
        alternate: () => any;
        smcup: () => any;
        alternateBuffer(): any;
        isAlt: boolean;
        rm: (...args: any[]) => any;
        resetMode(...args: any[]): any;
        decrst(...args: any[]): any;
        dectcemh: () => any;
        cursor_invisible: () => any;
        vi: () => any;
        civis: () => any;
        hideCursor(): any;
        rmcup: () => any;
        normalBuffer(): any;
        enableMouse(): void;
        disableMouse(): void;
        setMouse(opt: any, enable: any): void;
        _currentMouse: any;
        mouseEnabled: boolean;
        decstbm: (top: any, bottom: any) => any;
        csr: (top: any, bottom: any) => any;
        setScrollRegion(top: any, bottom: any): any;
        scA: () => any;
        saveCursorA(): any;
        rcA: () => any;
        restoreCursorA(): any;
        /**
         * Lesser Used
         */
        cht: (param: any) => any;
        cursorForwardTab(param: any): any;
        su: (param: any) => any;
        scrollUp(param: any): any;
        sd: (param: any) => any;
        scrollDown(param: any): any;
        initMouseTracking(...args: any[]): any;
        resetTitleModes(...args: any[]): any;
        cbt: (param: any) => any;
        cursorBackwardTab(param: any): any;
        rep: (param: any) => any;
        repeatPrecedingCharacter(param: any): any;
        tbc: (param: any) => any;
        tabClear(param: any): any;
        mc: (...args: any[]) => any;
        mediaCopy(...args: any[]): any;
        print_screen: () => any;
        ps: () => any;
        mc0(): any;
        prtr_on: () => any;
        po: () => any;
        mc5(): any;
        prtr_off: () => any;
        pf: () => any;
        mc4(): any;
        prtr_non: () => any;
        pO: () => any;
        mc5p(): any;
        setResources(...args: any[]): any;
        disableModifiers(param: any): any;
        setPointerMode(param: any): any;
        decstr: () => any;
        rs2: () => any;
        softReset(): any;
        decrqm: (param: any) => any;
        requestAnsiMode(param: any): any;
        decrqmp: (param: any) => any;
        requestPrivateMode(param: any): any;
        decscl: (...args: any[]) => any;
        setConformanceLevel(...args: any[]): any;
        decll: (param: any) => any;
        loadLEDs(param: any): any;
        decscusr: (param: any) => any;
        setCursorStyle(param: any): any;
        decsca: (param: any) => any;
        setCharProtectionAttr(param: any): any;
        restorePrivateValues(...args: any[]): any;
        deccara: (...args: any[]) => any;
        setAttrInRectangle(...args: any[]): any;
        savePrivateValues(...args: any[]): any;
        manipulateWindow(...args: any[]): any;
        getWindowSize(callback: any): any;
        decrara: (...args: any[]) => any;
        reverseAttrInRectangle(...args: any[]): any;
        setTitleModeFeature(...args: any[]): any;
        decswbv: (param: any) => any;
        setWarningBellVolume(param: any): any;
        decsmbv: (param: any) => any;
        setMarginBellVolume(param: any): any;
        deccra: (...args: any[]) => any;
        copyRectangle(...args: any[]): any;
        decefr: (...args: any[]) => any;
        enableFilterRectangle(...args: any[]): any;
        decreqtparm: (param: any) => any;
        requestParameters(param: any): any;
        decsace: (param: any) => any;
        selectChangeExtent(param: any): any;
        decfra: (...args: any[]) => any;
        fillRectangle(...args: any[]): any;
        decelr: (...args: any[]) => any;
        enableLocatorReporting(...args: any[]): any;
        decera: (...args: any[]) => any;
        eraseRectangle(...args: any[]): any;
        decsle: (...args: any[]) => any;
        setLocatorEvents(...args: any[]): any;
        decsera: (...args: any[]) => any;
        selectiveEraseRectangle(...args: any[]): any;
        decrqlp: (param: any, callback: any) => any;
        req_mouse_pos: (param: any, callback: any) => any;
        reqmp: (param: any, callback: any) => any;
        requestLocatorPosition(param: any, callback: any): any;
        decic: (...args: any[]) => any;
        insertColumns(...args: any[]): any;
        decdc: (...args: any[]) => any;
        deleteColumns(...args: any[]): any;
        out(name: any, ...args: any[]): any;
        ret: boolean;
        sigtstp(callback: any): void;
        pause(callback: any): () => void;
        _resume: () => void;
        resume(): void;
    }
    namespace Program {
        const global: any;
        const total: number;
        const instances: any[];
        function bind(program: any): void;
    }
    import fs = require("fs");
    import EventEmitter_2 = require("events");
    import EventEmitter = EventEmitter_2.EventEmitter;
}
declare module "lib/tput" {
    /**
     * sprintf
     *  http://www.cplusplus.com/reference/cstdio/printf/
     */
    export function sprintf(src: any, ...args: any[]): any;
    export function tryRead(file: any, ...args: any[]): any;
}
declare module "lib/unicode" {
    export function charWidth(str: any, i: any): any;
    export const blessed: typeof import("blessed");
    export function strWidth(str: any): number;
    export function isSurrogate(str: any, i: any): boolean;
    export const combiningTable: number[][];
    export const combining: {};
    export function isCombining(str: any, i: any): boolean;
    export function codePointAt(str: any, position: any): number;
    export function fromCodePoint(...args: any[]): any;
    export namespace chars {
        const wide: RegExp;
        const swide: RegExp;
        const all: RegExp;
        const surrogate: RegExp;
        const combining: any;
    }
}
declare module "lib/widget" {
    export const classes: string[];
    export namespace aliases {
        const ListBar: string;
        const PNG: string;
    }
}
declare module "lib/widgets/ansiimage" {
    export = ANSIImage;
    /**
     * ANSIImage
     */
    function ANSIImage(options: any): ANSIImage;
    class ANSIImage {
        /**
         * ANSIImage
         */
        constructor(options: any);
        scale: any;
        _noFill: boolean;
        __proto__: any;
        type: string;
        setImage(file: any): void;
        file: string;
        img: any;
        width: any;
        height: any;
        cellmap: any;
        play(): any;
        pause(): any;
        stop(): any;
        clearImage(): void;
        render(): any;
    }
    namespace ANSIImage {
        function curl(url: any): Buffer;
    }
}
declare module "lib/widgets/bigtext" {
    export = BigText;
    /**
     * BigText
     */
    function BigText(options: any): BigText;
    class BigText {
        /**
         * BigText
         */
        constructor(options: any);
        fch: any;
        ratio: {};
        font: {};
        fontBold: {};
        __proto__: any;
        type: string;
        loadFont(filename: any): {};
        setContent(content: any): void;
        content: string;
        text: any;
        render(): any;
        _shrinkWidth: boolean;
        _shrinkHeight: boolean;
    }
}
declare module "lib/widgets/box" {
    export = Box;
    /**
     * Box
     */
    function Box(options: any): Box;
    class Box {
        /**
         * Box
         */
        constructor(options: any);
        __proto__: any;
        type: string;
    }
}
declare module "lib/widgets/button" {
    export = Button;
    /**
     * Button
     */
    function Button(options: any): Button;
    class Button {
        /**
         * Button
         */
        constructor(options: any);
        __proto__: any;
        type: string;
        press(): any;
        value: boolean;
    }
}
declare module "lib/widgets/checkbox" {
    export = Checkbox;
    /**
     * Checkbox
     */
    function Checkbox(options: any): Checkbox;
    class Checkbox {
        /**
         * Checkbox
         */
        constructor(options: any);
        text: any;
        checked: any;
        value: any;
        __proto__: any;
        type: string;
        render(): any;
        check(): void;
        uncheck(): void;
        toggle(): void;
    }
}
declare module "lib/widgets/element" {
    export = Element;
    /**
     * Element
     */
    function Element(options: any): Element;
    class Element {
        /**
         * Element
         */
        constructor(options: any);
        _ignore: boolean;
        name: any;
        position: any;
        noOverflow: any;
        dockBorders: any;
        shadow: any;
        style: any;
        hidden: any;
        fixed: any;
        align: any;
        valign: any;
        wrap: boolean;
        shrink: any;
        ch: any;
        padding: {
            left: any;
            top: any;
            right: any;
            bottom: any;
        };
        border: any;
        parseTags: any;
        draggable: boolean;
        __proto__: any;
        type: string;
        sattr(style: any, fg: any, bg: any): number;
        onScreenEvent(type: any, handler: any): void;
        _slisteners: any;
        onceScreenEvent(type: any, handler: any): void;
        removeScreenEvent(type: any, handler: any): void;
        free(): void;
        hide(): void;
        show(): void;
        toggle(): void;
        focus(): Element;
        setContent(content: any, noClear: any, noTags: any): void;
        content: any;
        getContent(): any;
        setText(content: any, noClear: any): void;
        getText(): any;
        parseContent(noTags: any): boolean;
        _clines: any[];
        _pcontent: string;
        _parseTags(text: any): any;
        _parseAttr(lines: any): number[];
        _align(line: any, width: any, align: any): any;
        _wrapContent(content: any, width: any): any[];
        enableMouse(): void;
        enableKeys(): void;
        enableInput(): void;
        enableDrag(verify: any): boolean;
        _dragMD: (data: any) => void;
        _dragM: (data: any) => void;
        _draggable: boolean;
        disableDrag(): boolean;
        key(...args: any[]): any;
        onceKey(...args: any[]): any;
        unkey: (...args: any[]) => any;
        removeKey(...args: any[]): any;
        setIndex(index: any): void;
        setFront(): void;
        setBack(): void;
        clearPos(get: any, override: any): void;
        setLabel(options: any): void;
        _label: import("blessed/lib/widgets/box");
        _labelScroll: () => void;
        _labelResize: () => void;
        removeLabel(): void;
        setHover(options: any): void;
        _hoverOptions: any;
        removeHover(): void;
        /**
         * Positioning
         */
        _getPos(): any;
        /**
         * Position Getters
         */
        _getWidth(get: any): any;
        _getHeight(get: any): any;
        _getLeft(get: any): any;
        _getRight(get: any): any;
        _getTop(get: any): any;
        _getBottom(get: any): any;
        /**
         * Rendering - here be dragons
         */
        _getShrinkBox(xi: any, xl: any, yi: any, yl: any, get: any): {
            xi: any;
            xl: any;
            yi: any;
            yl: any;
        };
        lpos: any;
        _getShrinkContent(xi: any, xl: any, yi: any, yl: any): {
            xi: any;
            xl: any;
            yi: any;
            yl: any;
        };
        _getShrink(xi: any, xl: any, yi: any, yl: any, get: any): {
            xi: any;
            xl: any;
            yi: any;
            yl: any;
        };
        _getCoords(get: any, noscroll: any): {
            xi: any;
            xl: any;
            yi: any;
            yl: any;
            base: any;
            noleft: boolean;
            noright: boolean;
            notop: boolean;
            nobot: boolean;
            renders: any;
        };
        render(): {
            xi: any;
            xl: any;
            yi: any;
            yl: any;
            base: any;
            noleft: boolean;
            noright: boolean;
            notop: boolean;
            nobot: boolean;
            renders: any;
        };
        _render: any;
        /**
         * Content Methods
         */
        insertLine(i: any, line: any): void;
        deleteLine(i: any, n: any): void;
        insertTop(line: any): void;
        insertBottom(line: any): void;
        deleteTop(n: any): void;
        deleteBottom(n: any): void;
        setLine(i: any, line: any): void;
        setBaseLine(i: any, line: any): void;
        getLine(i: any): any;
        getBaseLine(i: any): any;
        clearLine(i: any): void;
        clearBaseLine(i: any): void;
        unshiftLine(line: any): void;
        shiftLine(n: any): void;
        pushLine(line: any): void;
        popLine(n: any): void;
        getLines(): any;
        getScreenLines(): any[];
        strWidth(text: any): any;
        screenshot(xi: any, xl: any, yi: any, yl: any): any;
    }
}
declare module "lib/widgets/filemanager" {
    export = FileManager;
    /**
     * FileManager
     */
    function FileManager(options: any): FileManager;
    class FileManager {
        /**
         * FileManager
         */
        constructor(options: any);
        cwd: any;
        file: any;
        value: any;
        __proto__: any;
        type: string;
        refresh(cwd: any, callback: any): any;
        pick(cwd: any, callback: any): void;
        reset(cwd: any, callback: any): void;
    }
}
declare module "lib/widgets/form" {
    export = Form;
    /**
     * Form
     */
    function Form(options: any): Form;
    class Form {
        /**
         * Form
         */
        constructor(options: any);
        __proto__: any;
        type: string;
        _refresh(): void;
        _children: any[];
        _visible(): boolean;
        next(): any;
        _selected: any;
        previous(): any;
        focusNext(): void;
        focusPrevious(): void;
        resetSelected(): void;
        focusFirst(): void;
        focusLast(): void;
        submit(): {};
        submission: {};
        cancel(): void;
        reset(): void;
    }
}
declare module "lib/widgets/image" {
    export = Image;
    /**
     * Image
     */
    function Image(options: any): Image;
    class Image {
        /**
         * Image
         */
        constructor(options: any);
        __proto__: any;
        type: string;
    }
}
declare module "lib/widgets/input" {
    export = Input;
    /**
     * Input
     */
    function Input(options: any): Input;
    class Input {
        /**
         * Input
         */
        constructor(options: any);
        __proto__: any;
        type: string;
    }
}
declare module "lib/widgets/layout" {
    export = Layout;
    /**
     * Layout
     */
    function Layout(options: any): Layout;
    class Layout {
        /**
         * Layout
         */
        constructor(options: any);
        renderer: any;
        __proto__: any;
        type: string;
        isRendered(el: any): boolean;
        getLast(i: any): any;
        getLastCoords(i: any): any;
        _renderCoords(): any;
        children: any;
        render(): any;
        lpos: any;
    }
}
declare module "lib/widgets/line" {
    export = Line;
    /**
     * Line
     */
    function Line(options: any): Line;
    class Line {
        /**
         * Line
         */
        constructor(options: any);
        ch: any;
        border: {
            type: string;
            __proto__: Line & Node;
        };
        __proto__: any;
        type: string;
    }
    import Node = require("blessed/lib/widgets/node");
}
declare module "lib/widgets/list" {
    export = List;
    /**
     * List
     */
    function List(options: any): List;
    class List {
        /**
         * List
         */
        constructor(options: any);
        value: string;
        items: any[];
        ritems: any;
        selected: number;
        _isList: boolean;
        interactive: boolean;
        mouse: any;
        __proto__: any;
        type: string;
        createItem(content: any): Box;
        add: (content: any) => Box;
        addItem: (content: any) => Box;
        appendItem(content: any): Box;
        removeItem(child: any): any;
        insertItem(child: any, content: any): Box;
        getItem(child: any): any;
        setItem(child: any, content: any): void;
        clearItems(): void;
        setItems(items: any): void;
        pushItem(content: any): number;
        popItem(): any;
        unshiftItem(content: any): number;
        shiftItem(): any;
        spliceItem(child: any, n: any, ...args: any[]): any[];
        find: (search: any, back: any) => number;
        fuzzyFind(search: any, back: any): number;
        getItemIndex(child: any): any;
        select(index: any): void;
        _listInitialized: boolean;
        move(offset: any): void;
        up(offset: any): void;
        down(offset: any): void;
        pick(label: any, callback: any): any;
        enterSelected(i: any): void;
        cancelSelected(i: any): void;
    }
    import Box = require("blessed/lib/widgets/box");
}
declare module "lib/widgets/listbar" {
    export = Listbar;
    /**
     * Listbar / HorizontalList
     */
    function Listbar(options: any): Listbar;
    class Listbar {
        /**
         * Listbar / HorizontalList
         */
        constructor(options: any);
        items: any[];
        ritems: any[];
        commands: any[];
        leftBase: number;
        leftOffset: number;
        mouse: any;
        __proto__: any;
        type: string;
        setItems(commands: any): void;
        add: (item: any, callback: any) => void;
        addItem: (item: any, callback: any) => void;
        appendItem(item: any, callback: any): void;
        render(): any;
        select(offset: any): void;
        removeItem(child: any): void;
        move(offset: any): void;
        moveLeft(offset: any): void;
        moveRight(offset: any): void;
        selectTab(index: any): void;
    }
}
declare module "lib/widgets/listtable" {
    export = ListTable;
    /**
     * ListTable
     */
    function ListTable(options: any): ListTable;
    class ListTable {
        /**
         * ListTable
         */
        constructor(options: any);
        __align: any;
        _header: Box;
        pad: any;
        __proto__: any;
        type: string;
        _calculateMaxes: any;
        setRows: (rows: any) => void;
        setData(rows: any): void;
        rows: any;
        _select: any;
        select(i: any): any;
        render(): any;
    }
    import Box = require("blessed/lib/widgets/box");
}
declare module "lib/widgets/loading" {
    export = Loading;
    /**
     * Loading
     */
    function Loading(options: any): Loading;
    class Loading {
        /**
         * Loading
         */
        constructor(options: any);
        __proto__: any;
        type: string;
        load(text: any): void;
        stop(): void;
    }
}
declare module "lib/widgets/log" {
    export = Log;
    /**
     * Log
     */
    function Log(options: any): Log;
    class Log {
        /**
         * Log
         */
        constructor(options: any);
        scrollback: any;
        scrollOnInput: any;
        __proto__: any;
        type: string;
        log: (...args: any[]) => any;
        add(...args: any[]): any;
        _scroll: any;
        scroll(offset: any, always: any): any;
        _userScrolled: boolean;
    }
}
declare module "lib/widgets/message" {
    export = Message;
    /**
     * Message / Error
     */
    function Message(options: any): Message;
    class Message {
        /**
         * Message / Error
         */
        constructor(options: any);
        __proto__: any;
        type: string;
        log: (text: any, time: any, callback: any) => void;
        display(text: any, time: any, callback: any): void;
        error(text: any, time: any, callback: any): void;
    }
}
declare module "lib/widgets/node" {
    export = Node;
    /**
     * Node
     */
    function Node(options: any): Node;
    class Node {
        /**
         * Node
         */
        constructor(options: any);
        options: any;
        screen: any;
        parent: any;
        children: any[];
        $: {};
        _: {};
        data: {};
        uid: number;
        index: number;
        detached: boolean;
        __proto__: any;
        type: string;
        insert(element: any, i: any): void;
        prepend(element: any): void;
        append(element: any): void;
        insertBefore(element: any, other: any): void;
        insertAfter(element: any, other: any): void;
        remove(element: any): void;
        detach(): void;
        free(): void;
        destroy(): void;
        forDescendants(iter: any, s: any): void;
        forAncestors(iter: any, s: any): void;
        collectDescendants(s: any): any[];
        collectAncestors(s: any): any[];
        emitDescendants(...args: any[]): void;
        emitAncestors(...args: any[]): void;
        hasDescendant(target: any): boolean;
        hasAncestor(target: any): boolean;
        get(name: any, value: any): any;
        set(name: any, value: any): any;
    }
    namespace Node {
        const uid: number;
    }
}
declare module "lib/widgets/overlayimage" {
    export = OverlayImage;
    /**
     * OverlayImage
     * Good example of w3mimgdisplay commands:
     * https://github.com/hut/ranger/blob/master/ranger/ext/img_display.py
     */
    function OverlayImage(options: any): OverlayImage;
    class OverlayImage {
        /**
         * OverlayImage
         * Good example of w3mimgdisplay commands:
         * https://github.com/hut/ranger/blob/master/ranger/ext/img_display.py
         */
        constructor(options: any);
        __proto__: any;
        type: string;
        spawn(file: any, args: any, opt: any, callback: any): cp.ChildProcessWithoutNullStreams;
        setImage(img: any, callback: any): any;
        _queue: any;
        _settingImage: boolean;
        file: any;
        renderImage(img: any, ratio: any, callback: any): any;
        clearImage(callback: any): any;
        imageSize(callback: any): any;
        termSize(callback: any): any;
        getPixelRatio(callback: any): any;
        renderImageSync(img: any, ratio: any): boolean;
        _lastSize: any;
        _props: {
            aleft: number;
            atop: number;
            width: number;
            height: number;
        };
        clearImageSync(): boolean;
        imageSizeSync(): {
            raw: string;
            width: number;
            height: number;
        };
        termSizeSync(_: any, recurse: any): any;
        getPixelRatioSync(): {
            tw: number;
            th: number;
        };
        _needsRatio: boolean;
        _ratio: {
            tw: number;
            th: number;
        };
        displayImage(callback: any): any;
    }
    namespace OverlayImage {
        const w3mdisplay: string;
    }
    import cp = require("child_process");
}
declare module "lib/widgets/progressbar" {
    export = ProgressBar;
    /**
     * ProgressBar
     */
    function ProgressBar(options: any): ProgressBar;
    class ProgressBar {
        /**
         * ProgressBar
         */
        constructor(options: any);
        filled: any;
        value: any;
        pch: any;
        ch: any;
        orientation: any;
        __proto__: any;
        type: string;
        render(): any;
        progress(filled: any): void;
        setProgress(filled: any): void;
        reset(): void;
    }
}
declare module "lib/widgets/prompt" {
    export = Prompt;
    /**
     * Prompt
     */
    function Prompt(options: any): Prompt;
    class Prompt {
        /**
         * Prompt
         */
        constructor(options: any);
        __proto__: any;
        type: string;
        input: (text: any, value: any, callback: any) => void;
        setInput: (text: any, value: any, callback: any) => void;
        readInput(text: any, value: any, callback: any): void;
    }
}
declare module "lib/widgets/question" {
    export = Question;
    /**
     * Question
     */
    function Question(options: any): Question;
    class Question {
        /**
         * Question
         */
        constructor(options: any);
        __proto__: any;
        type: string;
        ask(text: any, callback: any): void;
    }
}
declare module "lib/widgets/radiobutton" {
    export = RadioButton;
    /**
     * RadioButton
     */
    function RadioButton(options: any): RadioButton;
    class RadioButton {
        /**
         * RadioButton
         */
        constructor(options: any);
        __proto__: any;
        type: string;
        render(): any;
        toggle: any;
    }
}
declare module "lib/widgets/radioset" {
    export = RadioSet;
    /**
     * RadioSet
     */
    function RadioSet(options: any): RadioSet;
    class RadioSet {
        /**
         * RadioSet
         */
        constructor(options: any);
        __proto__: any;
        type: string;
    }
}
declare module "lib/widgets/screen" {
    export = Screen;
    /**
     * Screen
     */
    function Screen(options: any): Screen;
    class Screen {
        /**
         * Screen
         */
        constructor(options: any);
        program: any;
        tput: any;
        autoPadding: boolean;
        tabc: string;
        dockBorders: any;
        ignoreLocked: any;
        _unicode: any;
        fullUnicode: any;
        dattr: number;
        renders: number;
        position: {
            left: number;
            right: number;
            top: number;
            bottom: number;
            readonly height: any;
            readonly width: any;
        };
        left: number;
        aleft: number;
        rleft: number;
        right: number;
        aright: number;
        rright: number;
        top: number;
        atop: number;
        rtop: number;
        bottom: number;
        abottom: number;
        rbottom: number;
        ileft: number;
        itop: number;
        iright: number;
        ibottom: number;
        iheight: number;
        iwidth: number;
        padding: {
            left: number;
            top: number;
            right: number;
            bottom: number;
        };
        hover: any;
        history: any[];
        clickable: any[];
        keyable: any[];
        grabKeys: boolean;
        lockKeys: boolean;
        _buf: string;
        _ci: number;
        title: any;
        cursor: {
            artificial: any;
            shape: any;
            blink: any;
            color: any;
            _set: boolean;
            _state: number;
            _hidden: boolean;
        };
        __proto__: any;
        type: string;
        setTerminal(terminal: any): void;
        enter(): void;
        leave(): void;
        postEnter(): void;
        debugLog: Log;
        _destroy: any;
        destroy(): void;
        destroyed: boolean;
        log(...args: any[]): any;
        debug(...args: any[]): any;
        _listenMouse(el: any): void;
        _listenedMouse: boolean;
        enableMouse(el: any): void;
        _listenKeys(el: any): void;
        _listenedKeys: boolean;
        enableKeys(el: any): void;
        enableInput(el: any): void;
        _initHover(): void;
        _hoverText: Box;
        alloc(dirty: any): void;
        lines: any[];
        olines: any[];
        realloc(): void;
        render(): void;
        _borderStops: {};
        blankLine(ch: any, dirty: any): any[][];
        insertLine(n: any, y: any, top: any, bottom: any): void;
        deleteLine(n: any, y: any, top: any, bottom: any): void;
        insertLineNC(n: any, y: any, top: any, bottom: any): void;
        deleteLineNC(n: any, y: any, top: any, bottom: any): void;
        insertBottom(top: any, bottom: any): void;
        insertTop(top: any, bottom: any): void;
        deleteBottom(top: any, bottom: any): void;
        deleteTop(top: any, bottom: any): void;
        cleanSides(el: any): any;
        _dockBorders(): void;
        _getAngle(lines: any, x: any, y: any): any;
        draw(start: any, end: any): void;
        _reduceColor(color: any): any;
        attrCode(code: any, cur: any, def: any): number;
        codeAttr(code: any): string;
        focusOffset(offset: any): any;
        focusPrev: () => any;
        focusPrevious(): any;
        focusNext(): any;
        focusPush(el: any): void;
        focusPop(): any;
        saveFocus(): any;
        _savedFocus: any;
        restoreFocus(): any;
        rewindFocus(): any;
        _focus(self: any, old: any): void;
        clearRegion(xi: any, xl: any, yi: any, yl: any, override: any): void;
        fillRegion(attr: any, ch: any, xi: any, xl: any, yi: any, yl: any, override: any): void;
        key(...args: any[]): any;
        onceKey(...args: any[]): any;
        unkey: (...args: any[]) => any;
        removeKey(...args: any[]): any;
        spawn(file: any, args: any, options: any): cp.ChildProcessWithoutNullStreams;
        exec(file: any, args: any, options: any, callback: any): cp.ChildProcessWithoutNullStreams;
        readEditor(options: any, callback: any): any;
        displayImage(file: any, callback: any): any;
        setEffects(el: any, fel: any, over: any, out: any, effects: any, temp: any): void;
        sigtstp(callback: any): void;
        copyToClipboard(text: any): any;
        cursorShape(shape: any, blink: any): any;
        _cursorBlink: NodeJS.Timer;
        cursorColor(color: any): any;
        cursorReset: () => any;
        resetCursor(): any;
        _cursorAttr(cursor: any, dattr: any): {
            ch: any;
            attr: any;
        };
        screenshot(xi: any, xl: any, yi: any, yl: any, term: any): string;
        /**
         * Positioning
         */
        _getPos(): Screen;
    }
    namespace Screen {
        const global: any;
        const total: number;
        const instances: any[];
        function bind(screen: any): void;
    }
    import Log = require("blessed/lib/widgets/log");
    import Box = require("blessed/lib/widgets/box");
    import cp = require("child_process");
}
declare module "lib/widgets/scrollablebox" {
    export = ScrollableBox;
    /**
     * ScrollableBox
     */
    function ScrollableBox(options: any): ScrollableBox;
    class ScrollableBox {
        /**
         * ScrollableBox
         */
        constructor(options: any);
        scrollable: boolean;
        childOffset: number;
        childBase: number;
        baseLimit: any;
        alwaysScroll: any;
        scrollbar: any;
        track: any;
        __proto__: any;
        type: string;
        _scrollBottom(): any;
        setScroll: (offset: any, always: any) => any;
        scrollTo(offset: any, always: any): any;
        getScroll(): number;
        scroll(offset: any, always: any): any;
        _recalculateIndex(): number;
        resetScroll(): any;
        getScrollHeight(): number;
        getScrollPerc(s: any): number;
        setScrollPerc(i: any): any;
    }
}
declare module "lib/widgets/scrollabletext" {
    export = ScrollableText;
    /**
     * ScrollableText
     */
    function ScrollableText(options: any): ScrollableText;
    class ScrollableText {
        /**
         * ScrollableText
         */
        constructor(options: any);
        __proto__: any;
        type: string;
    }
}
declare module "lib/widgets/table" {
    export = Table;
    /**
     * Table
     */
    function Table(options: any): Table;
    class Table {
        /**
         * Table
         */
        constructor(options: any);
        pad: any;
        __proto__: any;
        type: string;
        _calculateMaxes(): any[];
        rows: any;
        _maxes: any[];
        setRows: (rows: any) => void;
        setData(rows: any): void;
        align: any;
        render(): any;
    }
}
declare module "lib/widgets/terminal" {
    export = Terminal;
    /**
     * Terminal
     */
    function Terminal(options: any): Terminal;
    class Terminal {
        /**
         * Terminal
         */
        constructor(options: any);
        handler: any;
        shell: any;
        args: any;
        cursor: any;
        cursorBlink: any;
        screenKeys: any;
        style: {};
        termName: any;
        __proto__: any;
        type: string;
        bootstrap(): void;
        term: any;
        _onData: (data: any) => void;
        pty: any;
        write(data: any): any;
        render(): any;
        dattr: any;
        _isMouse(buf: any): boolean;
        setScroll: (offset: any) => any;
        scrollTo(offset: any): any;
        getScroll(): any;
        scroll(offset: any): any;
        resetScroll(): any;
        getScrollHeight(): number;
        getScrollPerc(): number;
        setScrollPerc(i: any): any;
        screenshot(xi: any, xl: any, yi: any, yl: any): any;
        kill(): void;
    }
}
declare module "lib/widgets/text" {
    export = Text;
    /**
     * Text
     */
    function Text(options: any): Text;
    class Text {
        /**
         * Text
         */
        constructor(options: any);
        __proto__: any;
        type: string;
    }
}
declare module "lib/widgets/textarea" {
    export = Textarea;
    /**
     * Textarea
     */
    function Textarea(options: any): Textarea;
    class Textarea {
        /**
         * Textarea
         */
        constructor(options: any);
        value: any;
        __updateCursor: any;
        __proto__: any;
        type: string;
        _updateCursor(get: any): void;
        input: (callback: any) => void;
        setInput: (callback: any) => void;
        readInput(callback: any): void;
        _reading: boolean;
        _callback: any;
        _done: (err: any, value: any) => any;
        __done: any;
        _listener(ch: any, key: any): any;
        _typeScroll(): void;
        getValue(): any;
        setValue(value: any): void;
        _value: any;
        clearInput: () => void;
        clearValue(): void;
        submit(): any;
        cancel(): any;
        render(): any;
        editor: (callback: any) => any;
        setEditor: (callback: any) => any;
        readEditor(callback: any): any;
    }
}
declare module "lib/widgets/textbox" {
    export = Textbox;
    /**
     * Textbox
     */
    function Textbox(options: any): Textbox;
    class Textbox {
        /**
         * Textbox
         */
        constructor(options: any);
        secret: any;
        censor: any;
        __proto__: any;
        type: string;
        __olistener: any;
        _listener(ch: any, key: any): any;
        setValue(value: any): void;
        value: any;
        _value: any;
        submit(): any;
    }
}
declare module "lib/widgets/video" {
    export = Video;
    /**
     * Video
     */
    function Video(options: any): Video;
    class Video {
        /**
         * Video
         */
        constructor(options: any);
        parseTags: boolean;
        now: number;
        start: any;
        tty: Terminal;
        __proto__: any;
        type: string;
        exists(program: any): boolean;
    }
    import Terminal = require("blessed/lib/widgets/terminal");
}
declare module "vendor/tng" {
    /**
     * PNG
     */
    function PNG(file: any, options: any): any;
    class PNG {
        /**
         * PNG
         */
        constructor(file: any, options: any);
        options: any;
        colors: any;
        optimization: any;
        speed: any;
        file: any;
        format: string;
        bmp: any[];
        cellmap: any[][];
        frames: any;
        parseRaw(buf: any): {
            index: number;
            id: any;
            len: any;
            pos: number;
            end: number;
            type: any;
            name: any;
            data: any;
            crc: any;
            check: number;
            raw: any;
            flags: {
                critical: boolean;
                public_: boolean;
                conforming: boolean;
                copysafe: boolean;
            };
        }[];
        parseChunks(chunks: any): Buffer;
        width: any;
        height: any;
        bitDepth: any;
        colorType: any;
        compression: any;
        filter: any;
        interlace: any;
        palette: any[];
        size: any;
        idat: any;
        end: boolean;
        alpha: any;
        actl: {
            numFrames?: undefined;
            numPlays?: undefined;
        } | {
            numFrames: number;
            numPlays: any;
        } | {
            numFrames: any;
            numPlays: number;
        };
        parseLines(data: any): number[][] | Buffer[];
        sampleDepth: number;
        bitsPerPixel: number;
        bytesPerPixel: number;
        wastedBits: number;
        byteWidth: number;
        shiftStart: number;
        shiftMult: any;
        mask: number;
        unfilterLine(filter: any, line: any, prior: any): any;
        sampleLine(line: any, width: any): number[];
        filters: {
            sub: (x: any, line: any, prior: any, bpp: any) => any;
            up: (x: any, line: any, prior: any, bpp: any) => number;
            average: (x: any, line: any, prior: any, bpp: any) => number;
            paeth: (x: any, line: any, prior: any, bpp: any) => any;
            _predictor: (a: any, b: any, c: any) => any;
        };
        /**
         * Adam7 deinterlacing ported to javascript from PyPNG:
         * pypng - Pure Python library for PNG image encoding/decoding
         * Copyright (c) 2009-2015, David Jones (MIT License).
         * https://github.com/drj11/pypng
         *
         * Permission is hereby granted, free of charge, to any person
         * obtaining a copy of this software and associated documentation files
         * (the "Software"), to deal in the Software without restriction,
         * including without limitation the rights to use, copy, modify, merge,
         * publish, distribute, sublicense, and/or sell copies of the Software,
         * and to permit persons to whom the Software is furnished to do so,
         * subject to the following conditions:
         *
         * The above copyright notice and this permission notice shall be
         * included in all copies or substantial portions of the Software.
         *
         * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
         * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
         * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
         * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
         * BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
         * ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
         * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
         * SOFTWARE.
         */
        sampleInterlacedLines(raw: any): Buffer;
        createBitmap(pixels: any): any[];
        createCellmap(bmp: any, options: any): any[][];
        renderANSI(bmp: any): string;
        renderContent(bmp: any, el: any): string;
        renderScreen(bmp: any, screen: any, xi: any, xl: any, yi: any, yl: any): void;
        renderElement(bmp: any, el: any): void;
        pixelToSGR(pixel: any, ch: any): string;
        pixelToTags(pixel: any, ch: any): string;
        pixelToCell(pixel: any, ch: any): any[];
        getOutch: (x: any, y: any, line: any, pixel: any) => string;
        compileFrames(frames: any): any;
        compileFrames_lomem(frames: any): any;
        compileFrames_locpu(frames: any): any;
        _curBmp: any[];
        _lastBmp: any[];
        renderFrame(bmp: any, frame: any, i: any): any[];
        _animate(callback: any): any;
        _control: (state: any) => any;
        play(callback: any): any;
        pause(): void;
        stop(): void;
        toPNG(input: any): any;
        gifMagick(input: any): PNG;
        decompress(buffers: any): Buffer;
        /**
         * node-crc
         * https://github.com/alexgorbatchev/node-crc
         * https://github.com/alexgorbatchev/node-crc/blob/master/LICENSE
         *
         * The MIT License (MIT)
         *
         * Copyright 2014 Alex Gorbatchev
         *
         * Permission is hereby granted, free of charge, to any person obtaining
         * a copy of this software and associated documentation files (the
         * "Software"), to deal in the Software without restriction, including
         * without limitation the rights to use, copy, modify, merge, publish,
         * distribute, sublicense, and/or sell copies of the Software, and to
         * permit persons to whom the Software is furnished to do so, subject to
         * the following conditions:
         *
         * The above copyright notice and this permission notice shall be
         * included in all copies or substantial portions of the Software.
         *
         * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
         * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
         * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
         * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
         * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
         * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
         * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
         */
        crc32: (buf: any) => number;
        _debug(...args: any[]): any;
    }
    /**
     * GIF
     */
    function GIF(file: any, options: any): GIF;
    class GIF {
        /**
         * GIF
         */
        constructor(file: any, options: any);
        options: any;
        pixelLimit: any;
        totalPixels: number;
        width: number;
        height: number;
        flags: number;
        gct: boolean;
        gctsize: number;
        bgIndex: number;
        aspect: number;
        colors: number[][];
        images: {}[];
        extensions: {}[];
        delay: any;
        transparentColor: any;
        disposeMethod: any;
        useTransparent: any;
        numPlays: any;
        minBuffer: any;
        xmp: any;
        icc: any;
        fractint: any;
        decompress(input: any, codeSize: any): number[];
    }
    export { PNG as png, GIF as gif };
}
//# sourceMappingURL=index.d.ts.map