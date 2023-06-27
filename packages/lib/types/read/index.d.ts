declare module 'read'
 declare function read({
                         default: def = '',
                         input = process.stdin,
                         output = process.stdout,
                         completer,
                         prompt = '',
                         silent,
                         timeout,
                         edit,
                         terminal,
                         replace,
                       }): Promise<any>;
