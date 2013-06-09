module.exports = {
    mongo: {
        mail2sms: {
            host:   process.env.MONGO_HOST || '127.0.0.1',
            port:   process.env.MONGO_PORT || 27017,
            db:     'mail2sms',
            auth:   {
                username: 'mail2sms',
                password: '\/xRNo>*Yh>-]x/HI#Lhu<!j'
            },
            collections: ['users','contacts','groups','groups.stats','contacts.tmp','messages.log', 'activities.log','message.log']
        }
    }
};
