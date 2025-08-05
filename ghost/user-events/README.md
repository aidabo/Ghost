# User Events

## Usage

```js
const {UserEntryViewEvent} = require('@tryghost/user-events');

const event = UserEntryViewEvent.create({
    userId: user.id,
    userStatus: user.status,
    entryId: post.id,
    entryUrl: post.url
});

const DomainEvents = require('@tryghost/domain-events');

DomainEvents.dispatch(event);
```
