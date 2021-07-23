import { Handler } from 'aws-lambda';
import DynamoDB, { AttributeValue, UpdateItemInput } from 'aws-sdk/clients/dynamodb';
import jwt_decode from 'jwt-decode';
import createError from 'http-errors';

import { getMiddlewareAddedHandler } from './common/middleware';
import { getItemFromRouteTable } from './common/db';
import { toggleUpvoteRouteSchema } from './common/schema';
import { ToggleUpvoteRouteEvent, JwtPayload } from './common/types';
import { logger } from './common/logger';

const dynamoDb = new DynamoDB.DocumentClient();

/**
 * Allows a user to upvote a route if he has not upvoted before
 * If he has upvoted before, the upvote will be undone
 */
const toggleUpvoteRoute: Handler = async (event: ToggleUpvoteRouteEvent) => {
  if (!process.env['ROUTE_TABLE_NAME']) {
    throw createError(500, 'Route table name is not set');
  }
  const {
    headers: { Authorization },
    body: { username: routeOwnerUsername, createdAt },
  } = event;
  const { username } = (await jwt_decode(Authorization.split(' ')[1])) as JwtPayload;
  logger.info('toggleUpvoteRoute initiated', { data: { username, routeOwnerUsername, createdAt } });

  const Item = await getItemFromRouteTable(routeOwnerUsername, createdAt);

  let { upvotes } = Item;
  let hasVoted: boolean;
  if (upvotes.includes(username)) {
    upvotes = upvotes.filter((upvoteUsername) => upvoteUsername !== username);
    hasVoted = false;
  } else {
    upvotes = [...upvotes, username];
    hasVoted = true;
  }

  const updateItemInput: UpdateItemInput = {
    TableName: process.env['ROUTE_TABLE_NAME'],
    Key: {
      username: routeOwnerUsername as AttributeValue,
      createdAt: createdAt as AttributeValue,
    },
    UpdateExpression: 'SET upvotes = :upvotes',
    ExpressionAttributeValues: {
      ':upvotes': upvotes as AttributeValue,
    },
  };
  logger.info('toggleUpvoteRoute updateItem', { data: { username } });
  try {
    await dynamoDb.update(updateItemInput).promise();
  } catch (error) {
    logger.error('toggleUpvoteRoute error', { data: { username, error: error.stack } });
    throw createError(500, 'Error updating item', error);
  }

  logger.info('toggleUpvoteRoute success', { data: { username } });
  return {
    statusCode: 200,
    body: JSON.stringify({ Message: 'Toggle upvote route success', Item: { hasVoted } }),
  };
};

export const handler = getMiddlewareAddedHandler(toggleUpvoteRoute, toggleUpvoteRouteSchema);
