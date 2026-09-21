import { message as antdMessage } from 'antd';
import type { ArgsProps } from 'antd/es/message/interface';
import { sanitizeError } from './errorHandler';

export const message = {
  ...antdMessage,
  error: (args: string | ArgsProps) => {
    if (typeof args === 'string') {
      return antdMessage.error(sanitizeError(args));
    }
    if (args && args.content) {
      return antdMessage.error({ ...args, content: sanitizeError(args.content) });
    }
    return antdMessage.error(args);
  },
};
